# daw/aura_daw_client/CMakeLists.txt

cmake_minimum_required(VERSION 3.15)
project(AuraX_DAW)

# Find the JUCE library
# In a real project, you would use a more robust find_package script
# or add JUCE as a git submodule.
add_subdirectory(/path/to/your/JUCE/extras/Projucer/CMake)

# Add the source files for our DAW
file(GLOB_RECURSE APP_SOURCES "Source/*.cpp")

# Create the executable target
add_executable(AuraX_DAW ${APP_SOURCES})

# Link against the JUCE modules
target_link_libraries(AuraX_DAW PRIVATE
    juce_audio_basics
    juce_audio_devices
    juce_audio_formats
    juce_audio_processors
    juce_audio_utils
    juce_core
    juce_data_structures
    juce_events
    juce_graphics
    juce_gui_basics
    juce_gui_extra
)