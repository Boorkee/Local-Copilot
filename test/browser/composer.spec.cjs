const { test, expect } = require('@playwright/test');
const host = (page, data) => page.evaluate(data => window.postMessage(data, '*'), data);
test.beforeEach(async ({page}) => {
  await page.goto('/');
  await host(page, {type:'state', chat:{transcript:[]}, busy:false});
  await host(page, {type:'models', models:['local-chat', 'local-code'], defaultModel:'local-chat', defaultCodeModel:'local-code'});
  await host(page, {type:'connection', state:'ready'});
  await expect(page.getByRole('button', {name:'Speak', exact:true})).toBeVisible();
});
test('draft, dictation, review and send preserve the chat protocol', async ({page}) => {
  await page.getByRole('textbox', {name:'Message', exact:true}).fill('Existing draft.');
  await page.getByRole('button', {name:'Speak', exact:true}).click();
  await page.getByRole('button', {name:'Start listening'}).click();
  await expect.poll(() => page.evaluate(() => window.sent.at(-1)?.type)).toBe('startVoice');
  await host(page, {type:'voice',state:'listening'});
  await host(page, {type:'voice',level:0.7});
  await host(page, {type:'voice',state:'transcript',text:'Explain this function.'});
  await expect(page.locator('#prompt')).toHaveValue('Existing draft. Explain this function.');
  await expect(page.locator('#send')).toBeDisabled();
  await page.getByRole('button', {name:'Stop',exact:true}).click();
  await expect.poll(() => page.evaluate(() => window.sent.at(-1)?.type)).toBe('stopVoice');
  await host(page, {type:'voice',state:'idle'});
  await expect(page.locator('#send')).toBeEnabled();
  await page.locator('#send').click();
  await expect.poll(() => page.evaluate(() => window.sent.at(-1)?.type)).toBe('sendMessage');
  await expect(page.locator('.activity canvas')).toBeVisible();
  await expect(page.locator('#send')).toBeDisabled();
  await host(page,{type:'state',chat:{transcript:[{role:'user',content:'Hello'},{role:'assistant',content:'Done.'}]},busy:false});
  await expect(page.locator('.activity canvas')).toHaveCount(0);
});
test('renders safely and fits narrow, light, and reduced-motion views', async ({page}, testInfo) => {
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  page.on('console', m=> { if(m.type()==='error') errors.push(m.text()); });
  await page.reload();
  await host(page,{type:'state',chat:{transcript:[]},busy:false});
  await expect(page.locator('.mode-switch')).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('dark.png')});
  await page.setViewportSize({width:260,height:680});
  await expect.poll(() => page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('.mode-liquid')).toHaveCount(0);
  await page.evaluate(()=>{document.body.className='vscode-light'; document.documentElement.style.setProperty('--vscode-sideBar-background','#f7f8fb');document.documentElement.style.setProperty('--vscode-input-background','#fff');document.documentElement.style.setProperty('--vscode-foreground','#172334');});
  await page.getByRole('button',{name:'Speak',exact:true}).click();
  await host(page,{type:'voice',state:'error',text:'Microphone unavailable. Try again.'});
  await expect(page.getByRole('alert').filter({hasText:'Microphone unavailable'})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('light-narrow.png')});
  await host(page,{type:'state',chat:{transcript:[{role:'assistant',content:'<img src=x onerror=alert(1)>'}]},busy:false});
  await expect(page.locator('#messages img')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('moves the liquid selection, preserves rounded border, and removes the hint', async ({page}) => {
  const before = await page.locator('.mode-blob').boundingBox();
  await page.getByRole('button', {name:'Speak',exact:true}).click();
  await expect.poll(async () => (await page.locator('.mode-blob').boundingBox()).x - before.x).toBeGreaterThan(70);
  await expect(page.getByRole('button',{name:'Speak',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.composer-beam')).toHaveCSS('border-radius','12px');
  await expect(page.locator('.input-hint')).toHaveCount(0);
  await page.getByRole('button',{name:'Type',exact:true}).click();
  await expect.poll(async () => Math.abs((await page.locator('.mode-blob').boundingBox()).x - before.x)).toBeLessThan(1);
  const welcome = await page.locator('.empty').boundingBox();
  expect(welcome.y).toBeLessThan(820 / 3);
});
test('shows inline approvals and sends only the matching decision', async ({page}, testInfo) => {
  await host(page, {type:'review',review:{id:'edit-1',kind:'write',title:'example.ts',added:1,removed:1,lines:[{kind:'remove',text:'const a = 1;'}, {kind:'add',text:'const a = 2;'}]}});
  await expect(page.locator('.diff-add')).toHaveText('+const a = 2;');
  await expect(page.locator('.diff-remove')).toHaveText('−const a = 1;');
  await page.screenshot({path:testInfo.outputPath('inline-review.png')});
  await page.getByRole('button',{name:'Revert',exact:true}).click();
  await expect.poll(() => page.evaluate(() => window.sent.at(-1))).toEqual({type:'reviewDecision',id:'edit-1',approved:false});
  await host(page,{type:'review',review:{id:'cmd-2',kind:'command',title:'npm test',detail:'Working directory: project'}});
  await expect(page.getByRole('button',{name:'Run command',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Run command',exact:true}).click();
  await expect.poll(() => page.evaluate(() => window.sent.at(-1))).toEqual({type:'reviewDecision',id:'cmd-2',approved:true});
});
test('connection errors disable sending and offer retry without dropping a draft', async ({page}) => {
  await page.locator('#prompt').fill('Keep my draft');
  await host(page,{type:'connection',state:'error',text:'Start Ollama at http://127.0.0.1:11434.'});
  await expect(page.locator('#send')).toBeDisabled();
  await expect(page.locator('.activity')).toContainText('Ollama unavailable');
  await page.getByRole('button',{name:'Retry connection'}).click();
  await expect.poll(() => page.evaluate(() => window.sent.at(-1)?.type)).toBe('refreshModels');
  await host(page,{type:'connection',state:'ready'});
  await expect(page.locator('#send')).toBeEnabled();
  await expect(page.locator('#prompt')).toHaveValue('Keep my draft');
});

test('selects an installed model when the configured default is missing', async ({page}) => {
  await host(page, {type:'models',models:['installed:latest'],defaultModel:'missing:chat',defaultCodeModel:'missing:code'});
  await expect(page.locator('#model')).toHaveValue('installed:latest');
  await expect(page.locator('#codeModel')).toHaveValue('installed:latest');
});
