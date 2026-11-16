const fs = require('fs');
const geom = fs.readFileSync(__dirname + '/container-geom.js', 'utf8');
const html = fs.readFileSync(__dirname + '/template.html', 'utf8').replace('/*@GEOM@*/', () => geom);
fs.writeFileSync(__dirname + '/storage-container-generator-v1.html', html);
console.log('built storage-container-generator-v1.html', (html.length / 1024).toFixed(1) + ' KB');
