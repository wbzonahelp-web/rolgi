const fs = require('fs');
const path = require('path');

const routesDir = './src/api/routes';
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

const allEndpoints = {};

files.forEach(file => {
  const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
  const lines = content.split('\n');
  
  const endpoints = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Match fastify method calls
    const match = line.match(/fastify\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/);
    
    if (match) {
      const method = match[1].toUpperCase();
      const route = match[2];
      
      // Try to find description in nearby lines
      let description = '';
      for (let j = Math.max(0, i - 10); j < i; j++) {
        const prevLine = lines[j];
        if (prevLine.includes('description:')) {
          const descMatch = prevLine.match(/description:\s*['"]([^'"]+)['"]/);
          if (descMatch) {
            description = descMatch[1];
            break;
          }
        }
        // Try comment above
        if (prevLine.trim().startsWith('*') || prevLine.trim().startsWith('//')) {
          const commentText = prevLine.replace(/^[\s*\/]+/, '').trim();
          if (commentText && commentText.length > 10 && !commentText.includes('=====')) {
            description = commentText;
          }
        }
      }
      
      endpoints.push({ method, route, description });
    }
  }
  
  allEndpoints[file] = endpoints;
});

// Print results
Object.entries(allEndpoints).forEach(([file, endpoints]) => {
  const moduleName = file.replace('.js', '').replace('-routes', '');
  console.log(`\n=== ${moduleName.toUpperCase()} (${endpoints.length} endpoints) ===`);
  
  endpoints.forEach((ep, idx) => {
    console.log(`${idx + 1}. ${ep.method} ${ep.route}`);
    if (ep.description) {
      console.log(`   ${ep.description}`);
    }
  });
});

// Summary
const total = Object.values(allEndpoints).reduce((sum, eps) => sum + eps.length, 0);
console.log(`\n\n=== ИТОГО: ${total} эндпоинтов ===`);

