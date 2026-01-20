// AtomSpace Analytics
// Loads analytics pipelines from RocksDB and displays visualizations

let ws = null;              // Connection to main cogserver
let analyticsWs = null;     // Connection to analytics server
let analyticsLoaded = false;
let pendingCommand = null;
let analyticsPort = null;   // Computed as main port + 1

// Wrap atomese s-expression in JSON execute format for the /json endpoint
function executeAtomese(sexpr) {
    const escaped = sexpr.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `{ "tool": "execute", "params": { "atomese": "${escaped}" } }`;
}

// Bootstrap: Create child AtomSpace for analytics
const CREATE_ATOMSPACE = '(AtomSpace "analytics" (AtomSpaceOf (Link)))';

// Bootstrap: Load analytics pipelines from RocksDB and start analytics server
// The port parameter is passed to configure the analytics server
function makeLoadAnalytics(port) {
    return `(Trigger
    (PureExec
        (AtomSpace "analytics")
        (SetValue
            (RocksStorageNode "rocks:///usr/local/share/cogserver/analytics")
            (Predicate "*-open-ro-*")
            (AtomSpace "analytics"))
        (SetValue
            (RocksStorageNode "rocks:///usr/local/share/cogserver/analytics")
            (Predicate "*-load-atomspace-*"))
        (SetValue
            (Anchor "cfg-params")
            (Predicate "web-port")
            (Number ${port}))
        (Name "bootloader")))`;
}

// Run the type-counts pipeline (sent to analytics server)
const TYPE_COUNTS = '(Trigger (Name "type-counts"))';

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    connect();
});

function setupEventListeners() {
    document.getElementById('run-type-counts').addEventListener('click', runTypeCounts);
    document.getElementById('refresh-btn').addEventListener('click', () => {
        analyticsLoaded = false;
        loadAnalytics();
    });
}

function connect() {
    const statusElement = document.getElementById('connection-status');

    const savedBaseUrl = localStorage.getItem('cogserver-url');
    const baseUrl = savedBaseUrl || `ws://${window.location.hostname}:${window.location.port}/`;
    const serverUrl = baseUrl + 'json';

    // Extract port number from URL and compute analytics port
    const portMatch = baseUrl.match(/:(\d+)/);
    const mainPort = portMatch ? parseInt(portMatch[1]) : 18080;
    analyticsPort = mainPort + 1;
    console.log('Main port:', mainPort, 'Analytics port:', analyticsPort);

    console.log('Connecting to:', serverUrl);
    statusElement.textContent = 'Connecting...';
    statusElement.style.color = 'orange';

    try {
        ws = new WebSocket(serverUrl);

        ws.onopen = () => {
            console.log('Connected to CogServer');
            statusElement.textContent = 'Connected';
            statusElement.style.color = 'green';
            loadAnalytics();
        };

        ws.onmessage = (event) => {
            try {
                handleResponse(event.data);
            } catch (error) {
                console.error('Error handling response:', error);
                showError('Error processing response: ' + error.message);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            statusElement.textContent = 'Connection Error';
            statusElement.style.color = 'red';
            showError('Connection error - make sure CogServer is running');
        };

        ws.onclose = () => {
            console.log('Disconnected from CogServer');
            statusElement.textContent = 'Disconnected';
            statusElement.style.color = 'red';
            disableControls();
            setTimeout(() => {
                statusElement.textContent = 'Reconnecting...';
                statusElement.style.color = 'orange';
                connect();
            }, 3000);
        };

    } catch (error) {
        console.error('Connection error:', error);
        statusElement.textContent = 'Connection Failed';
        statusElement.style.color = 'red';
        showError('Failed to connect: ' + error.message);
    }
}

function loadAnalytics() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showError('Not connected to server');
        return;
    }

    const analyticsStatus = document.getElementById('analytics-status');
    analyticsStatus.textContent = 'Loading pipelines...';
    analyticsStatus.style.color = 'orange';

    showLoading(true, 'Creating analytics AtomSpace...');
    pendingCommand = 'create-atomspace';

    console.log('Creating analytics AtomSpace');
    ws.send(executeAtomese(CREATE_ATOMSPACE));
}

function continueLoadAnalytics() {
    showLoading(true, 'Loading analytics pipelines from RocksDB...');
    pendingCommand = 'load-analytics';

    console.log('Loading analytics from RocksDB, analytics port:', analyticsPort);
    ws.send(executeAtomese(makeLoadAnalytics(analyticsPort)));
}

function runTypeCounts() {
    if (!analyticsWs || analyticsWs.readyState !== WebSocket.OPEN) {
        showError('Not connected to analytics server');
        return;
    }

    if (!analyticsLoaded) {
        showError('Analytics not loaded yet. Please wait...');
        return;
    }

    showLoading(true, 'Running type-counts pipeline...');

    console.log('Running type-counts pipeline on analytics server');
    analyticsWs.send(executeAtomese(TYPE_COUNTS));
}

function handleResponse(data) {
    console.log('Raw response:', data);

    let response;
    try {
        response = JSON.parse(data);
    } catch (e) {
        console.log('Non-JSON response:', data);
        processResult(data);
        return;
    }

    if (response.content && Array.isArray(response.content)) {
        if (response.isError === true) {
            const errorText = response.content[0]?.text || 'Unknown error';
            console.error('Server error:', errorText);
            showError('Server error: ' + errorText);
            showLoading(false);
            pendingCommand = null;
            return;
        }

        const contentText = response.content[0]?.text || '';
        console.log('Content text:', contentText);

        try {
            const result = JSON.parse(contentText);
            processResult(result);
        } catch (e) {
            processResult(contentText);
        }
    } else {
        processResult(response);
    }
}

function processResult(result) {
    showLoading(false);

    if (pendingCommand === 'create-atomspace') {
        console.log('Analytics AtomSpace created');
        continueLoadAnalytics();
    } else if (pendingCommand === 'load-analytics') {
        console.log('Analytics loaded, connecting to analytics server on port', analyticsPort);
        connectToAnalyticsServer();
        pendingCommand = null;
    } else if (pendingCommand === 'type-counts') {
        displayTypeCountsResult(result);
        pendingCommand = null;
    }
}

function connectToAnalyticsServer() {
    const savedBaseUrl = localStorage.getItem('cogserver-url');
    const baseUrl = savedBaseUrl || `ws://${window.location.hostname}:${window.location.port}/`;

    // Replace the port in the URL with the analytics port
    const analyticsUrl = baseUrl.replace(/:\d+/, ':' + analyticsPort) + 'json';

    console.log('Connecting to analytics server:', analyticsUrl);
    showLoading(true, 'Connecting to analytics server...');

    try {
        analyticsWs = new WebSocket(analyticsUrl);

        analyticsWs.onopen = () => {
            console.log('Connected to analytics server');
            analyticsLoaded = true;
            document.getElementById('analytics-status').textContent = 'Loaded';
            document.getElementById('analytics-status').style.color = 'green';
            enableControls();
            showLoading(false);
        };

        analyticsWs.onmessage = (event) => {
            try {
                handleAnalyticsResponse(event.data);
            } catch (error) {
                console.error('Error handling analytics response:', error);
                showError('Error processing response: ' + error.message);
            }
        };

        analyticsWs.onerror = (error) => {
            console.error('Analytics WebSocket error:', error);
            showError('Analytics server connection error');
            showLoading(false);
        };

        analyticsWs.onclose = () => {
            console.log('Disconnected from analytics server');
            analyticsLoaded = false;
            disableControls();
        };

    } catch (error) {
        console.error('Analytics connection error:', error);
        showError('Failed to connect to analytics server: ' + error.message);
        showLoading(false);
    }
}

function handleAnalyticsResponse(data) {
    console.log('Analytics raw response:', data);

    let response;
    try {
        response = JSON.parse(data);
    } catch (e) {
        console.log('Non-JSON analytics response:', data);
        displayTypeCountsResult(data);
        return;
    }

    if (response.content && Array.isArray(response.content)) {
        if (response.isError === true) {
            const errorText = response.content[0]?.text || 'Unknown error';
            console.error('Analytics server error:', errorText);
            showError('Analytics error: ' + errorText);
            showLoading(false);
            return;
        }

        const contentText = response.content[0]?.text || '';
        console.log('Analytics content text:', contentText);

        try {
            const result = JSON.parse(contentText);
            displayTypeCountsResult(result);
        } catch (e) {
            displayTypeCountsResult(contentText);
        }
    } else {
        displayTypeCountsResult(response);
    }
    showLoading(false);
}

function displayTypeCountsResult(result) {
    console.log('Type counts result:', result);

    const chartContainer = document.getElementById('chart-container');
    const barChart = document.getElementById('bar-chart');
    const summaryPanel = document.getElementById('results-summary');
    const summaryText = document.getElementById('summary-text');

    barChart.innerHTML = '';

    let typeCounts = [];

    // Parse the result - expecting LinkValue table format:
    // { "type": "LinkValue", "value": [
    //   { "type": "LinkValue", "value": [
    //     { "type": "Type", "name": "ConceptNode" },
    //     { "type": "FloatValue", "value": [0, 0, 42] }
    //   ]},
    //   ...
    // ]}
    if (result && result.type === 'LinkValue' && Array.isArray(result.value)) {
        for (const row of result.value) {
            if (row && row.type === 'LinkValue' && Array.isArray(row.value) && row.value.length >= 2) {
                const typeEntry = row.value[0];
                const countEntry = row.value[1];

                // Extract type name
                let typeName = '';
                if (typeEntry && typeEntry.type === 'Type' && typeEntry.name) {
                    typeName = typeEntry.name;
                } else if (typeEntry && typeEntry.name) {
                    typeName = typeEntry.name;
                } else if (typeof typeEntry === 'string') {
                    typeName = typeEntry;
                }

                // Extract count (third element of FloatValue vector [0, 0, count])
                let count = 0;
                if (countEntry && countEntry.type === 'FloatValue' && Array.isArray(countEntry.value)) {
                    count = countEntry.value[2] || countEntry.value[0] || 0;
                } else if (typeof countEntry === 'number') {
                    count = countEntry;
                }

                if (typeName && count > 0) {
                    typeCounts.push({ type: typeName, count: Math.round(count) });
                }
            }
        }
    } else if (Array.isArray(result)) {
        // Fallback: plain array of rows
        for (const item of result) {
            if (Array.isArray(item) && item.length >= 2) {
                typeCounts.push({ type: String(item[0]), count: parseInt(item[1]) });
            }
        }
    } else if (typeof result === 'string') {
        // Fallback: parse string output
        const lines = result.split('\n').filter(line => line.trim());
        for (const line of lines) {
            const match = line.match(/^\s*(\S+)\s+(\d+)\s*$/);
            if (match) {
                typeCounts.push({ type: match[1], count: parseInt(match[2]) });
            }
        }
    }

    if (typeCounts.length === 0) {
        barChart.innerHTML = `<pre style="color: var(--text-primary); white-space: pre-wrap;">${JSON.stringify(result, null, 2)}</pre>`;
        chartContainer.classList.remove('hidden');
        summaryPanel.classList.add('hidden');
        return;
    }

    typeCounts.sort((a, b) => b.count - a.count);

    const maxCount = typeCounts[0]?.count || 1;

    for (const item of typeCounts) {
        const row = document.createElement('div');
        row.className = 'bar-row';

        const label = document.createElement('div');
        label.className = 'bar-label';
        label.textContent = item.type;
        label.title = item.type;

        const wrapper = document.createElement('div');
        wrapper.className = 'bar-wrapper';

        const bar = document.createElement('div');
        bar.className = 'bar';
        // Log scale for wide-ranging counts
        const logMax = Math.log10(maxCount + 1);
        const logVal = Math.log10(item.count + 1);
        bar.style.width = `${(logVal / logMax) * 100}%`;

        const value = document.createElement('div');
        value.className = 'bar-value';
        value.textContent = item.count.toLocaleString();

        wrapper.appendChild(bar);
        row.appendChild(label);
        row.appendChild(wrapper);
        row.appendChild(value);
        barChart.appendChild(row);
    }

    const totalAtoms = typeCounts.reduce((sum, item) => sum + item.count, 0);
    summaryText.textContent = `Found ${typeCounts.length} atom types with ${totalAtoms.toLocaleString()} total atoms. (Log scale)`;

    chartContainer.classList.remove('hidden');
    summaryPanel.classList.remove('hidden');
}

function enableControls() {
    document.getElementById('run-type-counts').disabled = false;
    document.getElementById('refresh-btn').disabled = false;
}

function disableControls() {
    document.getElementById('run-type-counts').disabled = true;
    document.getElementById('refresh-btn').disabled = true;
    analyticsLoaded = false;
}

function showLoading(show, message = 'Loading...') {
    const loadingPanel = document.getElementById('loading-panel');
    const loadingMessage = document.getElementById('loading-message');
    if (show) {
        loadingMessage.textContent = message;
        loadingPanel.classList.remove('hidden');
    } else {
        loadingPanel.classList.add('hidden');
    }
}

function showError(message) {
    const errorPanel = document.getElementById('error-panel');
    const errorMessage = document.getElementById('error-message');
    if (message) {
        errorMessage.textContent = message;
        errorPanel.classList.remove('hidden');
    } else {
        errorPanel.classList.add('hidden');
    }
}
