#
# Analytics CMakeLists.txt
#
# Build rules for compiling Atomese analytics into RocksDB format.
# During 'make', the .scm files are loaded into an AtomSpace and
# stored to RocksDB. During 'make install', the RocksDB directory
# is copied to the install location.
#

# Define the RocksDB output directory in build tree
SET(ANALYTICS_RDB_DIR "${CMAKE_BINARY_DIR}/analytics.rdb")

# Collect all .scm files in analytics directory (excluding build template)
FILE(GLOB ANALYTICS_SCM_FILES
    "${CMAKE_CURRENT_SOURCE_DIR}/*.scm")

# Create the build script from template
SET(BUILD_ANALYTICS_SCRIPT "${CMAKE_BINARY_DIR}/build-analytics.scm")
CONFIGURE_FILE(
    "${CMAKE_CURRENT_SOURCE_DIR}/build-analytics.scm.in"
    "${BUILD_ANALYTICS_SCRIPT}"
    @ONLY)

# Custom command to compile Atomese to RocksDB
# The CURRENT file is a marker that RocksDB uses; we use it to track build status
ADD_CUSTOM_COMMAND(
    OUTPUT "${ANALYTICS_RDB_DIR}/CURRENT"
    COMMAND ${CMAKE_COMMAND} -E remove_directory "${ANALYTICS_RDB_DIR}"
    COMMAND guile -l "${BUILD_ANALYTICS_SCRIPT}"
    DEPENDS ${ANALYTICS_SCM_FILES}
            "${CMAKE_CURRENT_SOURCE_DIR}/build-analytics.scm.in"
    WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
    COMMENT "Compiling Atomese analytics to RocksDB..."
)

# Custom target that depends on the RocksDB output
ADD_CUSTOM_TARGET(analytics-rdb ALL
    DEPENDS "${ANALYTICS_RDB_DIR}/CURRENT")

# Ensure 'make clean' removes the entire RocksDB directory
SET_DIRECTORY_PROPERTIES(PROPERTIES
    ADDITIONAL_MAKE_CLEAN_FILES "${ANALYTICS_RDB_DIR}")

# Install the RocksDB directory
# First, remove any existing installation to prevent database corruption
# (mixing old and new RocksDB files will corrupt the database)
INSTALL(CODE "
    set(ANALYTICS_DEST \"\$ENV{DESTDIR}\${CMAKE_INSTALL_PREFIX}/share/cogserver/analytics\")
    if(EXISTS \"\${ANALYTICS_DEST}\")
        message(STATUS \"Removing old analytics database: \${ANALYTICS_DEST}\")
        file(REMOVE_RECURSE \"\${ANALYTICS_DEST}\")
    endif()
"
    COMPONENT analytics
)

# Now install the new RocksDB directory
# Note: DIRECTORY installs the contents, so analytics.rdb/* -> analytics/*
INSTALL(DIRECTORY "${ANALYTICS_RDB_DIR}/"
    DESTINATION share/cogserver/analytics
    COMPONENT analytics
)
