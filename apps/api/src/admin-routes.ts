import {
  loginSchema,
  ORDER_STATUSES,
  orderStatusSchema,
  productCreateSchema,
  productPatchSchema,
  reorderSchema,
  settingsSchema,
  stockRequestStatusSchema,
  type OrderStatus,
} from '@alyosha/shared';
import multipart from '@fastify/multipart';
import type { FastifyContextConfig, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  checkPassword,
  createSessionToken,
  isValidSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  type AdminAuth,
} from './auth';
import type { Db } from './db/client';
import { changeOrderStatus, getOrder, getToday, listOrders } from './services/admin-orders';
import { deleteProductImage, InvalidImageError, MAX_UPLOAD_BYTES, saveProductImage } from './services/images';
import {
  createProduct,
  deleteProduct,
  getAdminProduct,
  listAdminProducts,
  listStockRequestGroups,
  markProductRequestsNotified,
  reorderProducts,
  setProductImage,
  setStockRequestStatus,
  updateProduct,
} from './services/products';
import { getSettings, saveSettings } from './services/settings';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Admin route that does not need a session (only the login itself). */
    public?: boolean;
  }
}

export interface AdminRoutesOptions {
  db: Db;
  /** null while ADMIN_PASSWORD_HASH / SESSION_SECRET are not set: the panel is switched off. */
  auth: AdminAuth | null;
  /** The storefront origin; state-changing admin requests from any other origin are refused. */
  origin: string;
  uploadsDir: string;
  loginLimit: FastifyContextConfig;
}

const PAGE_SIZE = 50;

function idParam(request: FastifyRequest): number | null {
  const id = Number((request.params as { id?: string }).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function fail(reply: FastifyReply, code: number, error: string) {
  return reply.code(code).send({ ok: false, error });
}

export async function registerAdminRoutes(app: FastifyInstance, options: AdminRoutesOptions): Promise<void> {
  const { db, auth, uploadsDir } = options;

  await app.register(
    async (admin) => {
      await admin.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 } });

      // Every admin route passes through here; nothing below is reachable without a session.
      admin.addHook('onRequest', async (request, reply) => {
        if (!auth) return fail(reply, 503, 'admin_not_configured');

        // The cookie is SameSite=Strict already; this also refuses cross-site form posts outright.
        const origin = request.headers.origin;
        if (request.method !== 'GET' && origin && origin !== options.origin) {
          return fail(reply, 403, 'forbidden_origin');
        }

        if (request.routeOptions.config.public) return;
        if (!isValidSessionToken(auth, request.cookies[SESSION_COOKIE])) {
          return fail(reply, 401, 'unauthorized');
        }
      });

      // Unknown admin paths go through the same hook, so they also answer 401 without a session.
      admin.setNotFoundHandler((_request, reply) => fail(reply, 404, 'not_found'));

      const cookieOptions = {
        path: '/api/admin',
        httpOnly: true,
        sameSite: 'strict' as const,
        secure: auth?.secureCookie ?? true,
      };

      // ---------- Session ----------

      admin.post('/login', { config: { public: true, ...options.loginLimit } }, async (request, reply) => {
        const parsed = loginSchema.safeParse(request.body);
        if (!parsed.success || !(await checkPassword(auth!, parsed.data.password))) {
          return fail(reply, 401, 'wrong_password');
        }
        reply.setCookie(SESSION_COOKIE, createSessionToken(auth!), { ...cookieOptions, maxAge: SESSION_TTL_SECONDS });
        return { ok: true };
      });

      admin.post('/logout', async (_request, reply) => {
        reply.clearCookie(SESSION_COOKIE, cookieOptions);
        return { ok: true };
      });

      admin.get('/me', async () => ({ ok: true }));

      // ---------- Today ----------

      admin.get('/today', async () => getToday(db));

      // ---------- Products ----------

      admin.get('/products', async () => listAdminProducts(db));

      admin.get('/products/:id', async (request, reply) => {
        const id = idParam(request);
        const product = id ? await getAdminProduct(db, id) : null;
        return product ?? fail(reply, 404, 'not_found');
      });

      admin.post('/products', async (request, reply) => {
        const parsed = productCreateSchema.safeParse(request.body);
        if (!parsed.success) return fail(reply, 400, 'invalid');
        reply.code(201);
        return { product: await createProduct(db, parsed.data), waiting: [] };
      });

      admin.patch('/products/:id', async (request, reply) => {
        const id = idParam(request);
        const parsed = productPatchSchema.safeParse(request.body);
        if (!id) return fail(reply, 404, 'not_found');
        if (!parsed.success) return fail(reply, 400, 'invalid');

        const result = await updateProduct(db, id, parsed.data);
        if (!result.ok) return fail(reply, result.error === 'not_found' ? 404 : 409, result.error);
        return { product: result.product, waiting: result.waiting };
      });

      admin.delete('/products/:id', async (request, reply) => {
        const id = idParam(request);
        if (!id) return fail(reply, 404, 'not_found');
        const result = await deleteProduct(db, id);
        if (!result.ok) return fail(reply, result.error === 'not_found' ? 404 : 409, result.error);
        await deleteProductImage(uploadsDir, result.imagePath);
        return { ok: true };
      });

      admin.post('/products/reorder', async (request, reply) => {
        const parsed = reorderSchema.safeParse(request.body);
        if (!parsed.success) return fail(reply, 400, 'invalid');
        await reorderProducts(db, parsed.data.ids);
        return listAdminProducts(db);
      });

      admin.post('/products/:id/image', async (request, reply) => {
        const id = idParam(request);
        if (!id || !(await getAdminProduct(db, id))) return fail(reply, 404, 'not_found');

        const file = await request.file();
        if (!file) return fail(reply, 400, 'invalid');

        let imagePath: string;
        try {
          // toBuffer() throws once the file passes MAX_UPLOAD_BYTES.
          imagePath = await saveProductImage(uploadsDir, await file.toBuffer());
        } catch (error) {
          if (error instanceof InvalidImageError) return fail(reply, 400, 'bad_image');
          if ((error as { statusCode?: number }).statusCode === 413) return fail(reply, 413, 'too_large');
          throw error;
        }

        const saved = await setProductImage(db, id, imagePath);
        if (!saved) {
          await deleteProductImage(uploadsDir, imagePath);
          return fail(reply, 404, 'not_found');
        }
        await deleteProductImage(uploadsDir, saved.previous);
        return { product: await getAdminProduct(db, id), waiting: [] };
      });

      admin.delete('/products/:id/image', async (request, reply) => {
        const id = idParam(request);
        const saved = id ? await setProductImage(db, id, null) : null;
        if (!id || !saved) return fail(reply, 404, 'not_found');
        await deleteProductImage(uploadsDir, saved.previous);
        return { product: await getAdminProduct(db, id), waiting: [] };
      });

      // ---------- "Notify me" requests ----------

      admin.get('/stock-requests', async (request) => {
        const all = (request.query as { all?: string }).all === '1';
        return listStockRequestGroups(db, all);
      });

      admin.patch('/stock-requests/:id', async (request, reply) => {
        const id = idParam(request);
        const parsed = stockRequestStatusSchema.safeParse(request.body);
        if (!parsed.success) return fail(reply, 400, 'invalid');
        if (!id || !(await setStockRequestStatus(db, id, parsed.data.status))) return fail(reply, 404, 'not_found');
        return { ok: true };
      });

      admin.post('/products/:id/stock-requests/notified', async (request, reply) => {
        const id = idParam(request);
        if (!id) return fail(reply, 404, 'not_found');
        return { ok: true, updated: await markProductRequestsNotified(db, id) };
      });

      // ---------- Orders ----------

      admin.get('/orders', async (request) => {
        const query = request.query as { status?: string; offset?: string };
        const status = ORDER_STATUSES.includes(query.status as OrderStatus) ? (query.status as OrderStatus) : undefined;
        const offset = Math.max(0, Number.parseInt(query.offset ?? '0', 10) || 0);
        // One extra row tells the client whether there is another page.
        const rows = await listOrders(db, { status, offset, limit: PAGE_SIZE + 1 });
        return { orders: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
      });

      admin.get('/orders/:id', async (request, reply) => {
        const id = idParam(request);
        const order = id ? await getOrder(db, id) : null;
        return order ?? fail(reply, 404, 'not_found');
      });

      admin.patch('/orders/:id', async (request, reply) => {
        const id = idParam(request);
        const parsed = orderStatusSchema.safeParse(request.body);
        if (!id) return fail(reply, 404, 'not_found');
        if (!parsed.success) return fail(reply, 400, 'invalid');

        const result = await changeOrderStatus(db, id, parsed.data.status);
        if (!result.ok) reply.code(result.error === 'not_found' ? 404 : 409);
        return result;
      });

      // ---------- Settings ----------

      admin.get('/settings', async () => getSettings(db));

      admin.put('/settings', async (request, reply) => {
        const parsed = settingsSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({
            ok: false,
            error: 'invalid',
            // Which fields to mark in the form.
            fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))],
          });
        }
        return saveSettings(db, parsed.data);
      });
    },
    { prefix: '/api/admin' },
  );
}
