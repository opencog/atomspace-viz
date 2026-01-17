# AtomSpace Visualizer

A web-based visualization tool for AtomSpace contents. Provides
statistics and the ability to visualize structures held in the
AtomSpace.

[***Try it here***](https://html-preview.github.io/?url=https://github.com/opencog/cogserver/blob/master/examples/visualizer/index.html).
You must have a CogServer running somewhere; you will need to type the
URL into the connection box.

## Prerequisites

1. A running CogServer instance with WebSocket support enabled
2. A web browser with WebSocket support (all modern browsers)

## Starting the CogServer

Start the CogServer using one of these methods:

#### Command Line:
```bash
/usr/local/bin/cogserver
```

#### From Guile Scheme:
```scheme
(use-modules (opencog) (opencog cogserver))
(start-cogserver)
```

#### From Python:
```python
import opencog, opencog.cogserver
opencog.cogserver.startCogserver()
```

### Using the Visualizer

1. Open `index.html` in a web browser.
   [***Try it here***](https://html-preview.github.io/?url=https://github.com/opencog/cogserver/blob/master/examples/visutalizer/index.html).
2. Enter the WebSocket URL of your CogServer (default: `ws://localhost:18080/`)
3. Click "Connect" (the JSON endpoint will be automatically appended)
4. Once connected, the visualizer will automatically fetch and display AtomSpace statistics

## Architecture

The visualizer consists of three main components:

1. **index.html**: Main HTML structure and layout
2. **styles.css**: Comprehensive styling with modern CSS features
3. **visualizer.js**: WebSocket management and JSON data processing logic

## Troubleshooting

### Connection Issues
- Verify the CogServer is running and accessible
- Check the WebSocket URL format (should be `ws://host:port/`)
- The visualizer will automatically append `/json` to connect to the JSON endpoint
- Ensure no firewall is blocking the WebSocket port
- Check browser console for detailed error messages
- Try the
  [../websockets/json-test.html](https://html-preview.github.io/?url=https://github.com/opencog/cogserver/blob/master/examples/websockets/json-test.html)
  page and check for errors.

### No Data Displayed
- Confirm the CogServer has JSON endpoint enabled
- Use the debug console to test JSON commands
- Check that the AtomSpace contains atoms to display

## Future Enhancements

Potential improvements for future versions:
- Graph visualization of atom relationships
- Real-time atom creation/deletion monitoring
- Atom type distribution charts
- Search and filter capabilities
- Export functionality for statistics
- Multi-server connection support

## License

Part of the OpenCog project. See the main project license for details.
