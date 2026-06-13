const { execSync } = require('child_process');
const fs = require('fs');

try {
  console.log("Generating migration SQL...");
  const sql = execSync('npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script').toString();
  fs.writeFileSync('migrate_nobom.sql', sql, 'utf8');
  console.log("SQL generated safely.");
} catch (e) {
  console.error("Error:", e);
}
