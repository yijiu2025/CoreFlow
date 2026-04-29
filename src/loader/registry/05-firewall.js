// src/loader/registry/02-firewall.js
import { initFirewall } from '../../firewall/index.js';

export default async (app) => {
  await app.register(initFirewall);
};
