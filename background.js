// background.js
chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-highlight") return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs?.[0]?.id;
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, { action: "toggleHighlight" })
  });
});
