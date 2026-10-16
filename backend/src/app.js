import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { routes } from './routes.js';
import { ApiError, errorHandler } from './shared/errors.js';
import swaggerUi from 'swagger-ui-express';
import { createOpenApi } from './docs/openapi.js';
import { swaggerRequestInterceptor } from './docs/swagger.js';

export function createApp(db, config) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((req,res,next) => { req.id = randomUUID(); res.set('X-Request-ID',req.id); res.set('Cache-Control','no-store'); next(); });
  const allowedOrigin = origin => origin === config.FRONTEND_ORIGIN || (!!config.API_ORIGIN && origin === config.API_ORIGIN);
  app.use(cors({ origin: (origin,callback) => callback(null,allowedOrigin(origin)), credentials: true, allowedHeaders: ['Content-Type','X-CSRF-Token'] }));
  app.use((req,_res,next) => {
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && !allowedOrigin(req.get('Origin'))) throw new ApiError(403,'ORIGIN','A trusted frontend or configured API Origin is required.');
    next();
  });
  app.use(express.json({ limit: '3mb' }));
  app.use(cookieParser());
  const specification = createOpenApi(config);
  app.get('/api-docs.json',(_req,res) => res.json(specification));
  // Cookie authentication and CSRF are enforced for Swagger writes just as for the frontend.
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specification, {
    swaggerOptions: { supportedSubmitMethods: ['get','post','put','patch','delete'], withCredentials: true, persistAuthorization: false, validatorUrl: null, requestInterceptor: swaggerRequestInterceptor },
    customSiteTitle: 'PortCity Digital API documentation',
  }));
  /**
   * @openapi
   * /health:
   *   get:
   *     tags: [Health]
   *     summary: Check process health
   *     security: []
   *     responses:
   *       '200':
   *         description: Process is running.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status: {type: string, enum: [ok]}
   */
  app.get('/health',(_req,res) => res.json({ status:'ok' }));
  /**
   * @openapi
   * /ready:
   *   get:
   *     tags: [Health]
   *     summary: Check PostgreSQL and schema readiness
   *     security: []
   *     responses:
   *       '200':
   *         description: Database schema is accessible.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status: {type: string, enum: [ready]}
   *       '503':
   *         description: Database or schema unavailable.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status: {type: string, enum: [unavailable]}
   */
  app.get('/ready',async (_req,res) => {
    try { await db.query('SELECT 1 FROM users LIMIT 1'); res.json({ status:'ready' }); }
    catch { res.status(503).json({ status:'unavailable' }); }
  });
  app.use('/api/v1',routes(db,config,config.NODE_ENV === 'production' ? '__Host-pcd_session' : 'pcd_session'));
  app.use((_req,_res,next) => next(new ApiError(404,'NOT_FOUND','Endpoint not found.')));
  app.use(errorHandler);
  return app;
}
