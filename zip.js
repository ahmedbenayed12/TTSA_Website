const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

console.log('📦 Starting to package the application...');

const output = fs.createWriteStream(path.join(__dirname, 'deploy.zip'));
const archive = archiver('zip', {
  zlib: { level: 9 } // Max compression
});

output.on('close', function() {
  console.log(`\n✅ deploy.zip successfully created!`);
  console.log(`Total size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
  console.log(`You can now upload deploy.zip to Oxahost via cPanel.\n`);
});

archive.on('warning', function(err) {
  if (err.code === 'ENOENT') {
    console.warn('⚠️ Archiver warning:', err);
  } else {
    throw err;
  }
});

archive.on('error', function(err) {
  throw err;
});

archive.pipe(output);

// Add files and directories
const filesToInclude = [
  'server.js',
  'package.json',
  'package-lock.json',
  '.env.example',
  'migrate.js',
  'check.js',
  'check_db.js',
  'test-smtp.js',
  'ttsa.db' // Include active SQLite file
];

const directoriesToInclude = [
  'db',
  'public',
  'routes',
  'middleware',
  'services',
  'uploads'
];

// Append individual files
filesToInclude.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    archive.file(filePath, { name: file });
  } else {
    console.warn(`⚠️ Warning: File not found - ${file}`);
  }
});

// Append directories
directoriesToInclude.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (fs.existsSync(dirPath)) {
    archive.directory(dirPath, dir, (file) => {
      // Exclude database temporary WAL/SHM files
      if (file.name.endsWith('-wal') || file.name.endsWith('-shm')) {
        return false;
      }
      return file;
    });
  } else {
    if (dir === 'uploads') {
      archive.append('', { name: 'uploads/' });
    } else {
      console.warn(`⚠️ Warning: Directory not found - ${dir}`);
    }
  }
});

archive.finalize();
