document.getElementById('start-btn').addEventListener('click', () => {
  const statusDiv = document.getElementById('status');
  const concurrencyInput = document.getElementById('concurrency-input');
  
  let concurrency = parseInt(concurrencyInput.value, 10) || 5;
  
  // 💡 安全ガードの上限を50に変更
  if (concurrency < 1) concurrency = 1;
  if (concurrency > 50) concurrency = 50;
  
  statusDiv.innerHTML = `<strong>並列数 [ ${concurrency} ] で開始！</strong><br>このポップアップは閉じても大丈夫です。`;
  
  chrome.runtime.sendMessage({
    action: 'start-refresh',
    concurrency: concurrency
  });
});
