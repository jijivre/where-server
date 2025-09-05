import express, { type Request, type Response } from 'express';

const app = express();

app.get('/', (_req: Request, res: Response) => {
  res.send('Hello World!');
});

export { app };
