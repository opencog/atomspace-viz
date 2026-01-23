// AtomSpace Analytics
// Loads analytics pipelines from RocksDB and displays visualizations

let ws = null;              // Connection to main cogserver
let analyticsWs = null;     // Connection to analytics server
let analyticsLoaded = false;
let pendingCommand = null;
let analyticsPendingCommand = null;  // 'mi-setup' or 'type-counts'
let analyticsPort = null;   // Computed as main port + 1

// State for MI selector
const miState = {
    relation: 'any',
    left: 'any',
    right: 'any',
    relationValue: '',
    leftValue: '',
    rightValue: ''
};

// Wrap atomese s-expression in JSON execute format for the /json endpoint
function executeAtomese(sexpr) {
    const escaped = sexpr
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/[\n\r]+/g, ' ')
        .replace(/\s+/g, ' ');
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

// Trigger the pair-counter pipeline
const TRIGGER_PAIR_COUNTER = '(Trigger (Name "pair-counter"))';

// Fetch the pair count from the Meet pattern
const GET_PAIR_COUNT = '(Trigger (ValueOf (DontExec (LiteralValueOf (Anchor "analytics") (Predicate "pair generator"))) (Predicate "total")))';

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
    setupMISelector();
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

    const cmd = executeAtomese(CREATE_ATOMSPACE);
    console.log('=== STEP 1: Creating analytics AtomSpace ===');
    console.log('Raw Atomese:', CREATE_ATOMSPACE);
    console.log('JSON command:', cmd);
    ws.send(cmd);
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

    // Disable button while running
    document.getElementById('run-type-counts').disabled = true;
    showLoading(true, 'Running type-counts pipeline...');

    analyticsPendingCommand = 'type-counts';
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
    console.log('processResult called, pendingCommand:', pendingCommand, 'result:', result);

    if (pendingCommand === 'create-atomspace') {
        console.log('=== STEP 1 COMPLETE: Analytics AtomSpace created ===');
        console.log('Server response:', result);
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
    const currentCommand = analyticsPendingCommand;
    analyticsPendingCommand = null;

    let response;
    try {
        response = JSON.parse(data);
    } catch (e) {
        console.log('Non-JSON analytics response:', data);
        if (currentCommand === 'type-counts') {
            displayTypeCountsResult(data);
        }
        return;
    }

    if (response.content && Array.isArray(response.content)) {
        if (response.isError === true) {
            const errorText = response.content[0]?.text || 'Unknown error';
            console.error('Analytics server error:', errorText);
            showError('Analytics error: ' + errorText);
            showLoading(false);
            document.getElementById('run-type-counts').disabled = false;
            document.getElementById('compute-mi-btn').disabled = false;
            return;
        }

        const contentText = response.content[0]?.text || '';
        console.log('Analytics content text:', contentText);

        if (currentCommand === 'mi-setup') {
            // Step 2: Trigger the pair-counter
            console.log('MI setup complete, triggering pair-counter');
            showLoading(true, 'Counting pairs...');
            analyticsPendingCommand = 'mi-counting';
            analyticsWs.send(executeAtomese(TRIGGER_PAIR_COUNTER));
            return;
        } else if (currentCommand === 'mi-counting') {
            // Step 3: Fetch the count
            console.log('Pair counting complete, fetching count');
            showLoading(true, 'Fetching count...');
            analyticsPendingCommand = 'mi-fetch-count';
            analyticsWs.send(executeAtomese(GET_PAIR_COUNT));
            return;
        } else if (currentCommand === 'mi-fetch-count') {
            // Step 4: Display the result
            console.log('Got pair count result:', contentText);
            try {
                const countResult = JSON.parse(contentText);
                displayMIResult(countResult);
            } catch (e) {
                displayMIResult(contentText);
            }
            showLoading(false);
            document.getElementById('compute-mi-btn').disabled = false;
            return;
        } else {
            try {
                const result = JSON.parse(contentText);
                displayTypeCountsResult(result);
            } catch (e) {
                displayTypeCountsResult(contentText);
            }
            showLoading(false);
            document.getElementById('run-type-counts').disabled = false;
        }
    } else {
        if (currentCommand === 'mi-setup') {
            // Step 2: Trigger the pair-counter
            console.log('MI setup complete (non-JSON), triggering pair-counter');
            showLoading(true, 'Counting pairs...');
            analyticsPendingCommand = 'mi-counting';
            analyticsWs.send(executeAtomese(TRIGGER_PAIR_COUNTER));
        } else if (currentCommand === 'mi-counting') {
            // Step 3: Fetch the count
            console.log('Pair counting complete (non-JSON), fetching count');
            showLoading(true, 'Fetching count...');
            analyticsPendingCommand = 'mi-fetch-count';
            analyticsWs.send(executeAtomese(GET_PAIR_COUNT));
        } else if (currentCommand === 'mi-fetch-count') {
            // Step 4: Display the result
            console.log('Got pair count result (non-JSON):', response);
            displayMIResult(response);
            showLoading(false);
            document.getElementById('compute-mi-btn').disabled = false;
        } else {
            displayTypeCountsResult(response);
            showLoading(false);
            document.getElementById('run-type-counts').disabled = false;
        }
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

function displayMIResult(result) {
    console.log('MI result:', result);

    const resultEl = document.getElementById('mi-result');
    const countEl = document.getElementById('mi-count-value');

    if (!resultEl || !countEl) {
        console.error('MI result elements not found');
        return;
    }

    let count = 0;

    // Parse the result - expecting FloatValue format:
    // { "type": "FloatValue", "value": [count] }
    if (result && result.type === 'FloatValue' && Array.isArray(result.value)) {
        count = result.value[0] || 0;
    } else if (typeof result === 'number') {
        count = result;
    } else if (typeof result === 'string') {
        // Try to parse as number
        const parsed = parseFloat(result);
        if (!isNaN(parsed)) {
            count = parsed;
        }
    }

    count = Math.round(count);
    countEl.textContent = count.toLocaleString() + ' pairs found';
    resultEl.classList.remove('hidden');
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

// MI Selector functions

// Build the Atomese pattern based on current MI selector state
function buildMIPattern() {
    const positions = ['relation', 'left', 'right'];
    const selected = positions.filter(pos => miState[pos] === 'selected');

    if (selected.length !== 2) {
        return null;
    }

    // Map selected positions to variable names (first selected → "left", second → "right")
    const varMap = {};
    varMap[selected[0]] = 'left';
    varMap[selected[1]] = 'right';

    // Type mapping for each position
    const typeMap = {
        relation: 'Predicate',
        left: 'Item',
        right: 'Item'
    };

    // Build the Atomese representation for each position
    function buildPosition(pos) {
        const type = typeMap[pos];
        if (miState[pos] === 'selected') {
            return `(Variable "${varMap[pos]}")`;
        } else if (miState[pos] === 'fixed') {
            const value = miState[pos + 'Value'] || '';
            return `(${type} "${value}")`;
        } else {
            return `(Signature (Type '${type}))`;
        }
    }

    const relationPart = buildPosition('relation');
    const leftPart = buildPosition('left');
    const rightPart = buildPosition('right');

    const pattern = `(Edge ${relationPart}\n    (List ${leftPart} ${rightPart}))`;
    const meet = `(Meet (VariableList (Variable "left") (Variable "right")) ${pattern})`;
    // Store the Meet on the analytics anchor for the counting pipeline to reference
    // Single DontExec prevents execution during storage
    const setup = `(SetValue (Anchor "analytics") (Predicate "pair generator") (DontExec ${meet}))`;

    return { pattern, meet, setup };
}

function setupMISelector() {
    const positions = ['relation', 'left', 'right'];

    positions.forEach(pos => {
        const select = document.getElementById(`mi-${pos}`);
        const input = document.getElementById(`mi-${pos}-value`);

        if (!select || !input) {
            return;
        }

        // Initialize state from current DOM values
        miState[pos] = select.value;
        miState[pos + 'Value'] = input.value;

        select.addEventListener('change', (e) => {
            miState[pos] = e.target.value;
            input.classList.toggle('hidden', e.target.value !== 'fixed');
            updateMIValidation();
        });

        input.addEventListener('input', (e) => {
            miState[pos + 'Value'] = e.target.value;
            updateMIValidation();
        });
    });

    const computeBtn = document.getElementById('compute-mi-btn');
    if (computeBtn) {
        computeBtn.addEventListener('click', computeMI);
    }
}

function updateMIValidation() {
    const positions = ['relation', 'left', 'right'];

    // Sync state from DOM to ensure consistency
    positions.forEach(pos => {
        const select = document.getElementById(`mi-${pos}`);
        const input = document.getElementById(`mi-${pos}-value`);
        if (select) {
            miState[pos] = select.value;
        }
        if (input) {
            miState[pos + 'Value'] = input.value;
        }
    });

    const selected = positions.filter(pos => miState[pos] === 'selected');

    const statusEl = document.getElementById('mi-status');
    const computeBtn = document.getElementById('compute-mi-btn');
    const patternDisplay = document.getElementById('mi-pattern-display');
    const patternText = document.getElementById('mi-pattern-text');

    if (!statusEl || !computeBtn) {
        return;
    }

    if (selected.length === 2) {
        const labels = selected.map(pos => pos.charAt(0).toUpperCase() + pos.slice(1));
        statusEl.textContent = `Selected: ${labels.join(', ')}`;
        statusEl.classList.add('valid');
        statusEl.classList.remove('invalid');
        computeBtn.disabled = false;

        // Display the generated pattern
        const result = buildMIPattern();
        if (result && patternDisplay && patternText) {
            patternText.textContent = result.pattern;
            patternDisplay.classList.remove('hidden');
        }
    } else {
        statusEl.textContent = `Select exactly 2 positions for MI computation (currently ${selected.length})`;
        statusEl.classList.remove('valid');
        statusEl.classList.add('invalid');
        computeBtn.disabled = true;

        // Hide pattern display
        if (patternDisplay) {
            patternDisplay.classList.add('hidden');
        }
    }
}

function computeMI() {
    const result = buildMIPattern();

    if (!result) {
        showError('Please select exactly 2 positions for MI computation');
        return;
    }

    if (!analyticsWs || analyticsWs.readyState !== WebSocket.OPEN) {
        showError('Not connected to analytics server');
        return;
    }

    // Disable button while processing
    const btn = document.getElementById('compute-mi-btn');
    if (btn) btn.disabled = true;

    showLoading(true, 'Setting up pair generator...');

    console.log('Sending MI setup to analytics server:', result.setup);
    console.log('Atomese command:', executeAtomese(result.setup));

    analyticsPendingCommand = 'mi-setup';
    // Send the setup to the analytics server
    analyticsWs.send(executeAtomese(result.setup));
}
