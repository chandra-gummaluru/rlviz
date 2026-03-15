// Simple Node.js script to check for basic syntax errors
const fs = require('fs');
const vm = require('vm');

const filesToCheck = [
    'src/main/adapter/viewmodel/SelectionViewModel.js',
    'src/main/adapter/viewmodel/ViewportViewModel.js',
    'src/main/adapter/viewmodel/InteractionViewModel.js',
    'src/main/adapter/viewmodel/NodeViewModel.js',
    'src/main/adapter/viewmodel/EdgeViewModel.js',
    'src/main/adapter/viewmodel/CanvasViewModel.js',
    'src/main/adapter/controller/CanvasController.js',
];

filesToCheck.forEach(file => {
    try {
        const content = fs.readFileSync(file, 'utf8');
        new vm.Script(content, { filename: file });
        console.log(`✓ ${file}`);
    } catch (error) {
        console.log(`✗ ${file}: ${error.message}`);
    }
});
