chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.message === "Hello from popup.js!") {
      // Your code to handle the message from popup.js goes here
      // For example, you can alert the message:
      alert(request.message);
    }
  });
  