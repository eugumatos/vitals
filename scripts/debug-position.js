const { app, BrowserWindow, screen } = require('electron');

app.dock?.hide();

app.on('ready', () => {
  const display = screen.getPrimaryDisplay();
  console.log('Display bounds:', JSON.stringify(display.bounds));
  console.log('Display workArea:', JSON.stringify(display.workArea));
  console.log('Display scaleFactor:', display.scaleFactor);
  console.log('Notch height (bounds.height - workArea.height):', display.bounds.height - display.workArea.height);
  console.log('Menu bar top offset (workArea.y - bounds.y):', display.workArea.y - display.bounds.y);

  const win = new BrowserWindow({
    width: display.bounds.width,
    height: 480,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    roundedCorners: false,
    alwaysOnTop: true,
    type: 'panel',
    webPreferences: { contextIsolation: true },
  });

  win.setAlwaysOnTop(true, 'screen-saver');

  // Check actual position
  const bounds = win.getBounds();
  console.log('Window bounds BEFORE load:', JSON.stringify(bounds));

  win.loadURL('data:text/html,<div style="background:red;width:100%;height:40px;"></div>');

  win.webContents.on('did-finish-load', () => {
    const bounds2 = win.getBounds();
    console.log('Window bounds AFTER load:', JSON.stringify(bounds2));

    // Try forcing position
    win.setPosition(0, 0);
    const bounds3 = win.getBounds();
    console.log('Window bounds AFTER setPosition(0,0):', JSON.stringify(bounds3));

    setTimeout(() => {
      app.quit();
    }, 5000);
  });
});
