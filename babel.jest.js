// Babel config used only by Jest (not picked up by Next.js)
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
  ],
};
