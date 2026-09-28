'use strict';
// Server view of site.config.json (the single brand/pricing config).
const site = require('../../site.config.json');

function limitsFor(plan) { return site.limits[plan === 'pass' ? 'pass' : 'free']; }

module.exports = { site, limitsFor, brand: site.brand, pricing: site.pricing };
