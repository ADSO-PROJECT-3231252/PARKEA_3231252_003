// Only Jest uses this file (babel-jest turns the tests and the code they import
// into something Node can run). Vite builds the app on its own and ignores it.
module.exports = {
    presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        ['@babel/preset-react', { runtime: 'automatic' }],
    ],
};
