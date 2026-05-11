const fs = require('fs');

const path = 'tests/js/transactions/dataLoader.test.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    /let loadCompositionSnapshotData;\n    let mockFetch;/,
    `let loadCompositionSnapshotData;
    let loadSectorsSnapshotData;
    let loadGeographySnapshotData;
    let loadMarketcapSnapshotData;
    let loadFxDailyRates;
    let loadPerformanceSeries;
    let mockFetch;`
);

content = content.replace(
    /loadCompositionSnapshotData = mod\.loadCompositionSnapshotData;\n    \}/,
    `loadCompositionSnapshotData = mod.loadCompositionSnapshotData;
        loadSectorsSnapshotData = mod.loadSectorsSnapshotData;
        loadGeographySnapshotData = mod.loadGeographySnapshotData;
        loadMarketcapSnapshotData = mod.loadMarketcapSnapshotData;
        loadFxDailyRates = mod.loadFxDailyRates;
        loadPerformanceSeries = mod.loadPerformanceSeries;
    }`
);

fs.writeFileSync(path, content);
