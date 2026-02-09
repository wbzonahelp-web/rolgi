const fs = require('fs');
const path = require('path');

const routesDir = './src/api/routes';
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

let totalEndpoints = 0;
const endpointsByFile = {};

files.forEach(file => {
  const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
  
  // Count fastify.get, fastify.post, fastify.put, fastify.delete, fastify.patch
  const matches = content.match(/fastify\.(get|post|put|delete|patch)\(/g) || [];
  
  endpointsByFile[file] = matches.length;
  totalEndpoints += matches.length;
});

console.log('Endpoints by file:');
Object.entries(endpointsByFile).sort((a, b) => b[1] - a[1]).forEach(([file, count]) => {
  console.log(`  ${file.padEnd(30)} ${count} endpoints`);
});

console.log(`\nTotal endpoints: ${totalEndpoints}`);
