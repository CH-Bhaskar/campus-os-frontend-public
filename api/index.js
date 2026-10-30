// Vercel serverless function — serves the mock CampusOS API at /api/*
// (demo only: data is in-memory per function instance)
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { dispatch } = require('./mock-server.cjs');

export default function handler(req, res) {
  dispatch(req, res);
}
