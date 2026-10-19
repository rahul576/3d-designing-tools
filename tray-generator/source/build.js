const fs = require('fs');
const geom = fs.readFileSync(__dirname + '/tray-geom.js', 'utf8');
const html = fs.readFileSync(__dirname + '/template.html', 'utf8').replace('/*@GEOM@*/', () => geom);
fs.writeFileSync(__dirname + '/tray-generator-v7.html', html);
console.log('built tray-generator-v7.html', (html.length / 1024).toFixed(1) + ' KB');
