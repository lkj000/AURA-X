#pragma once
#include <JuceHeader.h>

// This C++ object is exposed to the React GUI's `window` object.
// It is the definitive bridge between the C++ DAW core and the web-based UI.
class AuraBridge : public juce::JavascriptObject
{
public:
    AuraBridge(juce::WebBrowserComponent& browser);

    // This method becomes callable from React via `window.AuraBridge.sendMessageToAI(...)`
    void sendMessageToAI(const juce::var::NativeFunctionArgs& args)
    {
        if (args.numArguments == 1 && args.arguments[0].isString())
        {
            juce::String userMessage = args.arguments[0].toString();
            
            // This is where the orchestration begins. This message is passed to the
            // internal AuraConductor logic, which then queries the MCP servers
            // for context before calling the AI Co-Pilot API in the cloud.
            // conductor.processUserRequest(userMessage);
        }
    }

    // This method is called from C++ to send data TO the React UI.
    void sendDataToGui(const juce::String& eventName, const juce::var& payload)
    {
        juce::String script = "window.AuraAPI.dispatchEvent('" + eventName + "', " 
                            + juce::JSON::toString(payload) + ");";
        webBrowser.executeJavascript(script);
    }

private:
    juce::WebBrowserComponent& webBrowser;
};