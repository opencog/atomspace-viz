#
# AtomSpace Visualizer CMake file.
#
# This installs the web-based AtomSpace visualizer to
# share/cogserver/visualizer (the same location as when it was
# part of the cogserver repository).
#
CMAKE_MINIMUM_REQUIRED(VERSION 3.12)

PROJECT(atomspace-viz VERSION 1.0.0)

# Add the visualizer subdirectory for installation
ADD_SUBDIRECTORY(visualizer)

# ===================================================================
# Packaging
## Architecture the package is for.
EXECUTE_PROCESS(COMMAND dpkg --print-architecture
	OUTPUT_VARIABLE PACKAGE_ARCHITECTURE
	OUTPUT_STRIP_TRAILING_WHITESPACE
	ERROR_QUIET)

STRING(TIMESTAMP UTC_DATE %Y%m%d UTC)

# If 'sudo make install' is run before 'make package', then
# install_manifest.txt will be owned by root. Creating the file
# during configuration stage ensures that it is owned by the builder.
FILE(WRITE "${PROJECT_BINARY_DIR}/install_manifest.txt")

## Cpack configuration
SET(CPACK_GENERATOR "DEB")
SET(CPACK_PACKAGE_CONTACT "opencog@googlegroups.com")
SET(CPACK_PACKAGE_DESCRIPTION_FILE "${CMAKE_CURRENT_SOURCE_DIR}/LICENSE")
SET(CPACK_PACKAGE_DIRECTORY "${CMAKE_BINARY_DIR}/packages")
SET(CPACK_PACKAGE_DESCRIPTION_SUMMARY "Web-based AtomSpace Visualizer")
SET(CPACK_PACKAGE_NAME "atomspace-viz")
SET(CPACK_PACKAGE_VENDOR "opencog.org")
SET(CPACK_PACKAGE_VERSION "${PROJECT_VERSION}-${UTC_DATE}")
SET(CPACK_RESOURCE_FILE_LICENSE "${CMAKE_CURRENT_SOURCE_DIR}/LICENSE")
SET(CPACK_PACKAGE_FILE_NAME
	"${CPACK_PACKAGE_NAME}_${CPACK_PACKAGE_VERSION}_${PACKAGE_ARCHITECTURE}")
SET(CPACK_PACKAGING_INSTALL_PREFIX "/usr/local")

## Debian specific configurations
SET(CPACK_DEBIAN_PACKAGE_SECTION "web")
SET(CPACK_DEBIAN_PACKAGE_HOMEPAGE "http://opencog.org")
INCLUDE(CPack)
