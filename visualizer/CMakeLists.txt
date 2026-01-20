
# Install visualizer files to /usr/local/share/cogserver/visualizer/
INSTALL(FILES
	index.html
	analytics.html
	tree-view.html
	type-view.html
	DESTINATION share/cogserver/visualizer
	COMPONENT visualizer
)

INSTALL(FILES
	analytics.js
	atomspace-cache.js
	graph-view.js
	landing.js
	theme.js
	tree-view.js
	type-view.js
	styles.css
	DESTINATION share/cogserver/visualizer
	COMPONENT visualizer
)

# Install vis-network subdirectory
INSTALL(DIRECTORY vis-network
	DESTINATION share/cogserver/visualizer
	COMPONENT visualizer
	FILES_MATCHING
	PATTERN "*"
)
