import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, FileVideo, CheckCircle, AlertCircle, Download, Activity, Settings, Link as LinkIcon, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Global variables as requested
let serverUrl: string | null = null;
let selectedFile: File | null = null;
let currentTaskId: string | null = null;
let pollingInterval: any = null;

// Object type configuration for visual polish
const OBJECT_CONFIG: Record<string, { emoji: string; color: string; text: string; border: string }> = {
  person: { emoji: '🚶', color: 'bg-blue-500', text: 'text-blue-200', border: 'border-blue-500/30' },
  car: { emoji: '🚗', color: 'bg-green-500', text: 'text-green-200', border: 'border-green-500/30' },
  truck: { emoji: '🚛', color: 'bg-orange-500', text: 'text-orange-200', border: 'border-orange-500/30' },
  bus: { emoji: '🚌', color: 'bg-red-500', text: 'text-red-200', border: 'border-red-500/30' },
  motorcycle: { emoji: '🏍', color: 'bg-purple-500', text: 'text-purple-200', border: 'border-purple-500/30' },
  bicycle: { emoji: '🚲', color: 'bg-yellow-500', text: 'text-yellow-200', border: 'border-yellow-500/30' },
  default: { emoji: '📦', color: 'bg-slate-500', text: 'text-slate-200', border: 'border-slate-500/30' }
};

export default function App() {
  // UI State
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uiFile, setUiFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'complete' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [confidence, setConfidence] = useState(0.3);
  const [statusText, setStatusText] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, []);

  // Update video src when complete
  useEffect(() => {
    if (status === 'complete' && videoRef.current && serverUrl && currentTaskId) {
      // Direct DOM manipulation as requested
      videoRef.current.src = `${serverUrl}/stream/${currentTaskId}`;
      // Attributes are already set in JSX, but ensuring they are active
      videoRef.current.load();
      videoRef.current.play().catch(() => {
        // Autoplay might be blocked, user interaction needed
        console.log('Autoplay blocked');
      });
    }
  }, [status]);

  const handleConnect = async () => {
    if (!urlInput.trim()) return;
    
    // Remove trailing slash and ensure protocol
    let cleanUrl = urlInput.trim().replace(/\/$/, '');
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }

    // Mixed Content Warning
    if (window.location.protocol === 'https:' && cleanUrl.startsWith('http:')) {
      console.warn('Mixed Content Warning: Connecting to HTTP from HTTPS');
    }

    setConnectionError(false);
    
    try {
      const res = await fetch(`${cleanUrl}/health`, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      });
      
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      
      const data = await res.json();
      
      if (data.status === 'ok') {
        serverUrl = cleanUrl;
        setIsConnected(true);
      } else {
        setConnectionError(true);
      }
    } catch (e) {
      console.error('Connection failed:', e);
      setConnectionError(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      validateAndSetFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    const validTypes = ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-msvideo'];
    const validExtensions = ['.mp4', '.avi', '.mov'];
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (validTypes.includes(file.type) || validExtensions.includes(extension)) {
      selectedFile = file;
      setUiFile(file);
      setStatus('idle');
      setProgress(0);
      setStats({});
      setPreviewImage(null);
    } else {
      alert('Пожалуйста, загрузите видео в формате .mp4, .avi или .mov');
    }
  };

  const startProcessing = async () => {
    if (!selectedFile || !serverUrl) return;
    
    setStatus('uploading');
    setStatusText('Загрузка видео...');
    setProgress(0);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('confidence', confidence.toString());

    try {
      const res = await fetch(`${serverUrl}/upload`, {
        method: 'POST',
        body: formData,
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      });
      
      if (!res.ok) throw new Error('Upload failed');
      
      const data = await res.json();
      currentTaskId = data.task_id;
      
      setStatus('processing');
      setStatusText('Обработка: 0%');
      startPolling();
      
    } catch (e) {
      console.error(e);
      setStatus('error');
      setStatusText('Ошибка загрузки');
    }
  };

  const startPolling = () => {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(async () => {
      if (!serverUrl || !currentTaskId) return;
      
      try {
        const res = await fetch(`${serverUrl}/status/${currentTaskId}`, {
          headers: {
            'ngrok-skip-browser-warning': 'true',
          },
        });
        // Ignore network errors during polling
        if (!res.ok) return;
        
        const data = await res.json();
        
        // Update progress
        if (data.progress !== undefined) {
          setProgress(data.progress);
          setStatusText(`Обработка: ${data.progress}%`);
        }
        
        // Update preview
        if (data.preview_base64) {
          setPreviewImage(`data:image/jpeg;base64,${data.preview_base64}`);
        }
        
        // Update live stats
        if (data.live_stats) {
          setStats(data.live_stats);
        }
        
        // Handle completion
        if (data.status === 'completed') {
          clearInterval(pollingInterval);
          setStatus('complete');
          if (data.result && data.result.unique_objects) {
            setStats(data.result.unique_objects);
          }
        }
        
        // Handle error
        if (data.status === 'error') {
          clearInterval(pollingInterval);
          setStatus('error');
        }
        
      } catch (e) {
        // Ignore network errors
        console.log('Polling error (ignored):', e);
      }
    }, 2000);
  };

  const handleDownload = () => {
    if (serverUrl && currentTaskId) {
      window.open(`${serverUrl}/download/${currentTaskId}`, '_blank');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-900/80 p-6 rounded-2xl border border-slate-800 backdrop-blur-md shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl shadow-lg shadow-indigo-900/30">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">AI Object Tracker</h1>
              <p className="text-xs text-slate-400 font-mono flex items-center gap-2">
                v1.0.0 • Powered by YOLO
                {isConnected && (
                  <span className="flex items-center gap-1 text-green-400 ml-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    Connected
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex w-full md:w-auto gap-2 items-center">
            <div className="relative flex-1 md:w-96 group">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <LinkIcon className={`w-4 h-4 transition-colors ${isConnected ? 'text-green-500' : 'text-slate-500'}`} />
              </div>
              <input
                type="text"
                placeholder="URL сервера (вставьте ссылку из Colab)"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  setConnectionError(false);
                }}
                disabled={isConnected}
                className={`w-full bg-slate-950 border ${
                  connectionError 
                    ? 'border-red-500/50 text-red-400 focus:border-red-500' 
                    : isConnected 
                      ? 'border-green-900/50 text-green-400' 
                      : 'border-slate-800 focus:border-indigo-500'
                } rounded-xl py-3 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-slate-600 shadow-inner`}
              />
              {connectionError && (
                <span className="absolute -bottom-5 left-0 text-xs text-red-400 flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Не удалось подключиться
                </span>
              )}
            </div>
            <button
              onClick={handleConnect}
              disabled={isConnected || !urlInput}
              className={`px-6 py-3 rounded-xl text-sm font-bold transition-all transform active:scale-95 ${
                isConnected 
                  ? 'bg-green-600/10 text-green-400 border border-green-900/50 cursor-default'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20 hover:shadow-indigo-900/40'
              }`}
            >
              {isConnected ? 'Подключено' : 'Подключиться'}
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {/* Main Content Area */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            
            {/* Left Column: Controls & Upload */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Confidence Control */}
              <div className={`bg-slate-900/50 p-6 rounded-2xl border border-slate-800 transition-all duration-300 ${!isConnected ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
                <div className="flex items-center gap-2 mb-6">
                  <Settings className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Настройки</h2>
                </div>
                
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <label className="text-sm font-medium text-slate-300">Confidence Threshold</label>
                    <span className="text-sm font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/20">
                      {confidence.toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="relative h-6 flex items-center">
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={confidence}
                      onChange={(e) => setConfidence(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-800 rounded-full appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
                      style={{
                        backgroundImage: `linear-gradient(to right, #6366f1 ${((confidence - 0.1) / 0.9) * 100}%, #1e293b ${((confidence - 0.1) / 0.9) * 100}%)`
                      }}
                    />
                  </div>
                  
                  <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-800/50 pt-4">
                    Порог уверенности нейросети. Чем выше значение, тем строже отбор объектов.
                  </p>
                </div>
              </div>

              {/* Upload Zone */}
              <div className={`relative group ${!isConnected ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".mp4,.avi,.mov"
                  className="hidden"
                />
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    relative overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer p-8 text-center min-h-[240px] flex flex-col items-center justify-center
                    ${isDragging 
                      ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02] shadow-xl shadow-indigo-500/10' 
                      : uiFile 
                        ? 'border-indigo-500/50 bg-slate-900/80 shadow-lg' 
                        : 'border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800/50 bg-slate-900/30'
                    }
                  `}
                >
                  <div className="flex flex-col items-center gap-4 relative z-10 w-full">
                    <div className={`p-5 rounded-full transition-all duration-300 ${
                      uiFile 
                        ? 'bg-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.3)] scale-110' 
                        : 'bg-slate-800 group-hover:bg-slate-700 group-hover:scale-110'
                    }`}>
                      {uiFile ? (
                        <FileVideo className="w-10 h-10 text-indigo-400" />
                      ) : (
                        <Upload className="w-10 h-10 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                      )}
                    </div>
                    
                    <div className="w-full">
                      <h3 className={`font-medium text-lg mb-2 transition-colors ${uiFile ? 'text-indigo-200' : 'text-slate-200'}`}>
                        {uiFile ? uiFile.name : 'Загрузить видео'}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {uiFile ? (
                          <span className="text-indigo-300/80 font-mono text-xs bg-indigo-500/10 px-2 py-1 rounded-full">
                            {formatFileSize(uiFile.size)}
                          </span>
                        ) : (
                          'Перетащите файл или кликните (.mp4, .avi)'
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Start Button */}
                <button
                  onClick={startProcessing}
                  disabled={!uiFile || status !== 'idle'}
                  className={`w-full mt-4 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all transform active:scale-[0.97] duration-100 ${
                    !uiFile || status !== 'idle'
                      ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'
                      : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-900/30 hover:shadow-indigo-900/50 border border-indigo-500/20'
                  }`}
                >
                  {status === 'idle' ? (
                    <>
                      <Play className="w-5 h-5 fill-current" /> Начать обработку
                    </>
                  ) : (
                    <span className="flex items-center gap-3">
                      <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Обработка...
                    </span>
                  )}
                </button>
              </div>

            </div>

            {/* Right Column: Status & Results */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Empty State */}
              {status === 'idle' && !uiFile && (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-slate-900/30 rounded-2xl border border-slate-800/50 border-dashed text-slate-600">
                  <div className="w-24 h-24 rounded-full bg-slate-900/50 flex items-center justify-center mb-6 border border-slate-800">
                    <FileVideo className="w-10 h-10 opacity-20" />
                  </div>
                  <p className="text-lg font-medium">Ожидание загрузки файла...</p>
                  <p className="text-sm opacity-50 mt-2">Выберите видео для начала работы</p>
                </div>
              )}

              {/* Processing Status */}
              <AnimatePresence mode="wait">
                {(status === 'uploading' || status === 'processing') && (
                  <motion.div 
                    key="processing"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl"
                  >
                    <div className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-white flex items-center gap-3">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                          </span>
                          {statusText}
                        </h3>
                        <span className="text-sm font-mono font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                          {progress}%
                        </span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.5, ease: "easeInOut" }}
                        />
                      </div>
                    </div>
                    
                    {/* Live Preview */}
                    <div className="aspect-video bg-black relative flex items-center justify-center overflow-hidden group">
                      {previewImage ? (
                        <motion.img 
                          key={previewImage} // Key change triggers animation
                          initial={{ opacity: 0.8 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.2 }}
                          src={previewImage} 
                          alt="Processing Preview" 
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-slate-900 flex items-center justify-center">
                          <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                            <p className="text-slate-500 text-sm animate-pulse">Подготовка превью...</p>
                          </div>
                        </div>
                      )}
                      
                      {/* Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
                      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                        <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10">
                          <p className="text-xs text-indigo-200 font-mono flex items-center gap-2">
                            <Activity className="w-3 h-3" /> LIVE PROCESSING
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Live Stats */}
                    {Object.keys(stats).length > 0 && (
                      <div className="p-4 bg-slate-900/80 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {Object.entries(stats).map(([key, value]) => {
                          const config = OBJECT_CONFIG[key] || OBJECT_CONFIG.default;
                          return (
                            <motion.div 
                              key={key}
                              layout
                              initial={{ scale: 0.9, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className={`flex items-center justify-between p-2 rounded-lg bg-slate-800/50 border ${config.border}`}
                            >
                              <span className="text-lg mr-2">{config.emoji}</span>
                              <span className="text-xs text-slate-400 uppercase tracking-wider flex-1">{key}</span>
                              <motion.span 
                                key={`${key}-${value}`} // Trigger animation on value change
                                initial={{ scale: 1.2, color: '#fff' }}
                                animate={{ scale: 1, color: 'rgba(226, 232, 240, 1)' }}
                                transition={{ duration: 0.2 }}
                                className="font-mono font-bold text-slate-200"
                              >
                                {value}
                              </motion.span>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Results */}
                {status === 'complete' && (
                  <motion.div 
                    key="results"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    className="space-y-6"
                  >
                    {/* Video Player */}
                    <div className="bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl relative group">
                      <div className="aspect-video bg-slate-900 relative flex items-center justify-center">
                        <video 
                          ref={videoRef}
                          className="w-full h-full object-contain"
                          controls
                          autoPlay
                          muted
                          playsInline
                        />
                      </div>
                    </div>

                    {/* Stats Cards - Final */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(stats).map(([key, value], index) => {
                        const config = OBJECT_CONFIG[key] || OBJECT_CONFIG.default;
                        return (
                          <motion.div 
                            key={key}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className={`relative overflow-hidden bg-slate-900/80 p-5 rounded-2xl border ${config.border} flex flex-col items-center text-center group hover:bg-slate-800/80 transition-colors`}
                          >
                            <div className={`absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity text-4xl`}>
                              {config.emoji}
                            </div>
                            <div className={`w-12 h-12 rounded-full ${config.color} bg-opacity-20 flex items-center justify-center mb-3 text-2xl shadow-lg`}>
                              {config.emoji}
                            </div>
                            <span className="text-3xl font-bold text-white font-mono mb-1">{value}</span>
                            <span className={`text-xs uppercase tracking-wider font-bold ${config.text}`}>{key}</span>
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* Download Action */}
                    <div className="flex justify-end pt-4">
                      <button 
                        onClick={handleDownload}
                        className="flex items-center gap-3 px-8 py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-lg shadow-lg shadow-green-900/20 hover:shadow-green-900/40 transition-all transform active:scale-[0.97] duration-100"
                      >
                        <Download className="w-6 h-6" />
                        Скачать видео
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Error State */}
                {status === 'error' && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-red-500/10 border border-red-500/20 p-8 rounded-2xl flex items-center gap-6 text-red-400"
                  >
                    <div className="p-4 bg-red-500/20 rounded-full">
                      <AlertCircle className="w-10 h-10" />
                    </div>
                    <div>
                      <h3 className="font-bold text-xl mb-2 text-red-300">Ошибка обработки</h3>
                      <p className="opacity-80">Не удалось обработать видео. Проверьте соединение с сервером или попробуйте другой файл.</p>
                      <button 
                        onClick={() => setStatus('idle')}
                        className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-sm font-medium transition-colors"
                      >
                        Попробовать снова
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
