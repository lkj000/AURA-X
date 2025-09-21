#include <JuceHeader.h>
#include "GUI/MainComponent.h" // The top-level JUCE component
#include "MCP/MCP_SystemManager.h" // Manages the MCP servers

class AuraXApplication : public juce::JUCEApplication
{
public:
    AuraXApplication() {}
    const juce::String getApplicationName() override { return ProjectInfo::projectName; }
    // ... other required JUCEApplication methods ...

    void initialise(const juce::String& commandLine) override
    {
        // This method is called when the application starts.
        
        // 1. Initialize the Model Context Protocol (MCP) servers.
        // This is the "nervous system" that exposes the DAW's state.
        mcpSystem.initialiseServers();

        // 2. Create the main application window.
        mainWindow.reset(new MainWindow(getApplicationName()));
    }

    void shutdown() override
    {
        // This method is called when the application quits.
        
        // 1. Gracefully shut down the MCP servers.
        mcpSystem.shutdownServers();

        // 2. Destroy the main window.
        mainWindow = nullptr;
    }

private:
    class MainWindow : public juce::DocumentWindow
    {
    public:
        MainWindow(juce::String name) : DocumentWindow(name, juce::Colours::black, DocumentWindow::allButtons)
        {
            setUsingNativeTitleBar(true);
            setContentOwned(new MainComponent(), true); // MainComponent holds our UI
            setResizable(true, true);
            centreWithSize(getWidth(), getHeight());
            setVisible(true);
        }
        // ... window close handler ...
    };

    std::unique_ptr<MainWindow> mainWindow;
    MCP_SystemManager mcpSystem;
};

// This macro creates the application's entry point
START_JUCE_APPLICATION(AuraXApplication)