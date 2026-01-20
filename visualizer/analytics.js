// AtomSpace Analytics
// Loads analytics pipelines from RocksDB and displays visualizations

let ws = null;
let analyticsLoaded = false;
let pendingCommand = null;

// Bootstrap: Create child AtomSpace for analytics
const CREATE_ATOMSPACE = '(AtomSpace "analytics" (AtomSpaceOf (Link)))';

// Bootstrap: Load analytics pipelines from RocksDB into the child AtomSpace
const LOAD_ANALYTICS = `(Trigger
    (PureExec
        (AtomSpace "analytics")
        (SetValue
            (RocksStorageNode "rocks:///usr/local/share/cogserver/analytics")
            (Predicate "*-open-*")
            (AtomSpace "analytics"))
        (SetValue
            (RocksStorageNode "rocks:///usr/local/share/cogserver/analytics")
            (Predicate "*-load-atomspace-*"))))`;

// Run the type-counts pipeline
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
    ws.send(CREATE_ATOMSPACE + '\n');
}

function continueLoadAnalytics() {
    showLoading(true, 'Loading analytics pipelines from RocksDB...');
    pendingCommand = 'load-analytics';

    console.log('Loading analytics from RocksDB');
    ws.send(LOAD_ANALYTICS + '\n');
}

function runTypeCounts() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showError('Not connected to server');
        return;
    }

    if (!analyticsLoaded) {
        showError('Analytics not loaded yet. Please wait...');
        return;
    }

    showLoading(true, 'Running type-counts pipeline...');
    pendingCommand = 'type-counts';

    console.log('Running type-counts pipeline');
    ws.send(TYPE_COUNTS + '\n');
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
        analyticsLoaded = true;
        document.getElementById('analytics-status').textContent = 'Loaded';
        document.getElementById('analytics-status').style.color = 'green';
        enableControls();
        console.log('Analytics bootstrap complete');
        pendingCommand = null;
    } else if (pendingCommand === 'type-counts') {
        displayTypeCountsResult(result);
        pendingCommand = null;
    }
}

function displayTypeCountsResult(result) {
    console.log('Type counts result:', result);

    const chartContainer = document.getElementById('chart-container');
    const barChart = document.getElementById('bar-chart');
    const summaryPanel = document.getElementById('results-summary');
    const summaryText = document.getElementById('summary-text');

    barChart.innerHTML = '';

    let typeCounts = [];

    if (typeof result === 'string') {
        const lines = result.split('\n').filter(line => line.trim());
        for (const line of lines) {
            let match = line.match(/Usage count of type:\s*(\S+)\s*is equal to\s*(\d+)/);
            if (match) {
                typeCounts.push({ type: match[1], count: parseInt(match[2]) });
                continue;
            }
            match = line.match(/^\s*(\S+)\s+(\d+)\s*$/);
            if (match) {
                typeCounts.push({ type: match[1], count: parseInt(match[2]) });
            }
        }
    } else if (Array.isArray(result)) {
        for (const item of result) {
            if (Array.isArray(item) && item.length >= 2) {
                typeCounts.push({ type: String(item[0]), count: parseInt(item[1]) });
            } else if (typeof item === 'object' && item.type && item.count !== undefined) {
                typeCounts.push({ type: item.type, count: parseInt(item.count) });
            }
        }
    } else if (typeof result === 'object') {
        for (const [type, count] of Object.entries(result)) {
            if (typeof count === 'number') {
                typeCounts.push({ type, count });
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
