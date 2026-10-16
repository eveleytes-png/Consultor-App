// Access checks decide which source to display. Never erase saved user data on startup.
const replayedEvents=new WeakSet();
for(const event of ['click','submit'])document.addEventListener(event,e=>{if(!replayedEvents.has(e))window.SheetsApp?.intercept(e);},true);
