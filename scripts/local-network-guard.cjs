// Used only by the isolated verification app; never installed in the product.
const net = require('node:net');
const allowed = host => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(host || 'localhost'));
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const first = normalized[0];
  const host = typeof first === 'object' && first !== null ? (first.host || first.hostname)
    : (typeof normalized[1] === 'string' ? normalized[1] : undefined);
  const unix = (typeof first === 'string' && !/^\d+$/.test(first)) || (first && typeof first === 'object' && first.path);
  if (!unix && !allowed(host)) throw new Error('Verification app blocked a non-local connection');
  return connect.apply(this, args);
};
const originalFetch = globalThis.fetch;
if (originalFetch) globalThis.fetch = function (input, init) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!allowed(url.hostname)) throw new Error('Verification app blocked a non-local fetch');
  return originalFetch.call(this, input, init);
};
