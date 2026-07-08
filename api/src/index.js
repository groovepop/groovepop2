// Entry point — dynamically loads all HTTP functions for the v4 programming model
const fs = require('fs');
const path = require('path');

const functionsDir = path.join(__dirname, 'functions');
fs.readdirSync(functionsDir).forEach(file => {
  if (file.endsWith('.js')) {
    require(path.join(functionsDir, file));
  }
});
