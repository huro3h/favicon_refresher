// ポップアップからの合図を待ち受ける
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'start-refresh') {
    refreshBookmarks(message.concurrency);
  }
});

async function refreshBookmarks(concurrencyLimit) {
  try {
    const bookmarkBarTree = await chrome.bookmarks.getSubTree('1');
    const urls = [];
    
    function extractUrls(nodes) {
      for (const node of nodes) {
        if (node.url && node.url.startsWith('http')) {
          urls.push(node.url);
        }
        if (node.children) {
          extractUrls(node.children);
        }
      }
    }
    extractUrls(bookmarkBarTree);
    
    if (urls.length === 0) return;
    
    let completedCount = 0;
    await chrome.action.setBadgeText({ text: urls.length.toString() });
    await chrome.action.setBadgeBackgroundColor({ color: '#007bff' });
    await chrome.action.setBadgeTextColor({ color: '#ffffff' });
    
    const hiddenWindow = await chrome.windows.create({
      focused: false,
      state: 'minimized'
    });
    const targetWindowId = hiddenWindow.id;
    
    let currentIndex = 0;
    
    async function poolWorker() {
      while (currentIndex < urls.length) {
        const myIndex = currentIndex++;
        if (myIndex >= urls.length) break;
        
        const url = urls[myIndex];
        
        try {
          const tab = await chrome.tabs.create({
            windowId: targetWindowId,
            url: url,
            active: false
          });
          
          // 💡 改良した待機関数を呼び出す
          await waitForTabLoad(tab.id);
          
          await chrome.tabs.remove(tab.id);
        } catch (err) {
          console.error(`タブ処理エラー (${url}):`, err);
        } finally {
          completedCount++;
          const remaining = urls.length - completedCount;
          
          if (remaining > 0) {
            chrome.action.setBadgeText({ text: remaining.toString() });
          } else {
            chrome.action.setBadgeText({ text: '' });
          }
        }
      }
    }
    
    const workers = [];
    for (let i = 0; i < concurrencyLimit; i++) {
      workers.push(poolWorker());
    }
    
    await Promise.all(workers);
    await chrome.windows.remove(targetWindowId);
    chrome.action.setBadgeText({ text: '' });
    console.log('すべてのブックマークアイコンの再取得が完了しました！');
    
  } catch (error) {
    console.error('バックグラウンド処理エラー:', error);
    chrome.action.setBadgeText({ text: '' });
  }
}

// 💡 強化した読み込み監視用ヘルパー関数
function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    let isComplete = false;
    let hasFavicon = false;
    let timeoutId = null;
    
    // 安全に終了して次のタブへ進むための共通処理
    const safeResolve = (delay = 1500) => {
      chrome.tabs.onUpdated.removeListener(listener);
      if (timeoutId) clearTimeout(timeoutId);
      // 💡 50並列の混雑を考慮し、長めの余韻（デフォルト1.5秒）を置いてキャッシュを確定させる
      setTimeout(resolve, delay);
    };
    
    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== tabId) return;
      
      // 1. ページの読み込み完了をチェック
      if (changeInfo.status === 'complete') {
        isComplete = true;
      }
      
      // 2. ファビコンURLの確定をチェック
      if (changeInfo.favIconUrl || tab.favIconUrl) {
        hasFavicon = true;
      }
      
      // ページが完了し、かつファビコンの存在が確認できたら猶予を置いて終了
      if (isComplete && hasFavicon) {
        safeResolve(1500);
      }
    };
    
    chrome.tabs.onUpdated.addListener(listener);
    
    // 💡 タイムアウト（セーフティネット）
    // ファビコンがそもそも存在しないサイトや、読み込みが遅すぎるサイトでスタックするのを防ぐ
    timeoutId = setTimeout(async () => {
      try {
        // 12秒経っても終わらない場合、ページ自体が完了しているならキャッシュ書き込みを少し待って次へ
        const currentTab = await chrome.tabs.get(tabId);
        if (currentTab.status === 'complete') {
          safeResolve(1000);
        } else {
          safeResolve(0); // 完全にフリーズしているサイトは即諦めて次へ
        }
      } catch (e) {
        safeResolve(0);
      }
    }, 12000);
  });
}
