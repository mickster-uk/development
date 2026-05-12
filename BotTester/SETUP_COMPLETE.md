# 🤖 Bot Tester - Project Summary

## ✅ What Has Been Created

A fully functional **Electron desktop application** for advanced bot testing with a professional, modern UI.

### Complete Features Implemented

#### 1. **Three-Bot Evaluation System**
- **Bot 1**: Query receiving (user input)
- **Bot 2**: Response generation (LLM-powered)
- **Bot 3**: Answer evaluation (correctness assessment)

#### 2. **Professional Modern UI**
- Dark theme with sleek design
- Responsive layout that adapts to different screen sizes
- Smooth animations and transitions
- Color-coded feedback (Green = Correct, Red = Incorrect)

#### 3. **Dynamic Layout**
```
┌─────────────────────────────────────────┐
│          HEADER & NAVIGATION             │
├──────────────────────────┬─────────────┤
│ SETTINGS PANEL           │             │
│  - Endpoint config       │  MAIN       │
│  - Model selection       │  CONTENT    │
│  - Load models           │  AREA       │
├──────────────────────────┤             │
│ HISTORY PANEL            │             │
│  - Past tests            │  Input      │
│  - Quick reload          │  Box        │
└──────────────────────────┤             │
                           │ Left Box    │
                           │ (Query)     │
                           │             │
                           │ Right Box   │
                           │ (Response)  │
                           │ Color-coded │
                           │             │
                           │ Evaluation  │
                           │ Details     │
                           └─────────────┘
```

### File Structure
```
BotTester/
├── 📄 package.json                 Configuration & dependencies
├── 📄 main.js                      Electron main process (95 lines)
├── 📄 preload.js                   IPC security bridge (20 lines)
├── 📄 index.html                   UI structure (200+ lines)
├── 📄 styles.css                   Professional styling (650+ lines)
├── 📄 renderer.js                  Frontend logic (280 lines)
├── 📄 README.md                    Full documentation
├── 📄 QUICKSTART.md                Quick start guide
├── 📁 src/
│   └── 📄 bot-orchestrator.js      Three-bot coordination (150 lines)
└── 📁 node_modules/                Dependencies (318 packages)
```

## 🎯 Key Features

### Settings Management
✓ Configure LLM endpoint (default: Ollama on localhost:11434)
✓ Select models for each bot dynamically
✓ Load available models from LLM service
✓ Auto-save configurations to disk
✓ Settings persist between sessions

### Testing Interface
✓ Large textarea for entering queries
✓ Real-time query display on left
✓ Response display on right (offset lower)
✓ Color-coded evaluation badge
✓ Detailed confidence and reasoning

### History Tracking
✓ All test results saved automatically
✓ Quick-access history panel
✓ Click any past test to reload results
✓ Clear history with confirmation
✓ Persistent storage in Electron userData

### Professional UI Elements
✓ Smooth loading spinner during tests
✓ Error messages with helpful feedback
✓ Disabled buttons during operations
✓ Keyboard shortcuts (Ctrl/Cmd+Enter to run)
✓ Responsive design (1200px+ recommended)
✓ Custom scrollbars in panels

## 🚀 How to Run

### Prerequisites
1. **Ollama or similar LLM service**
   ```bash
   # Install from https://ollama.ai/
   ollama serve  # Starts on http://localhost:11434
   ```

2. **Node.js 14+**
   - Already have it? Great!
   - Otherwise: https://nodejs.org/

### Run Commands

**Start the app:**
```bash
cd /Users/mikefinch/Desktop/development/BotTester
npm start
```

**Build for distribution:**
```bash
npm run build
```

## 🎨 UI/UX Highlights

### Color Scheme
- **Primary**: Blue (#3b82f6)
- **Success**: Green (#10b981)
- **Error**: Red (#ef4444)
- **Background**: Dark slate (#0f172a - #334155)
- **Text**: Light slate (#f1f5f9 - #cbd5e1)

### Responsive Breakpoints
- **1200px+**: Full layout with sidebar panels
- **768px - 1200px**: Stacked layout
- **< 768px**: Mobile optimized

### Animations
- Rotating logo icon (3s loop)
- Smooth button hover effects
- Loading spinner animation
- Fade transitions on panels
- Smooth scrolling

## 📊 Bot Orchestration Flow

```
USER INPUT
    ↓
Bot 1 Receives Query
    ↓
[Query] → Bot 2 (e.g., "mistral")
    ↓
Bot 2 Response Generated
    ↓
[Query + Response] → Bot 3 (e.g., "neural-chat")
    ↓
Bot 3 Evaluates (returns JSON)
    ↓
UI Updates:
- Display Query in Left Box
- Display Response in Right Box
- Color Box: Green (isCorrect: true) or Red (isCorrect: false)
- Show Confidence & Reasoning
    ↓
Save to History
```

## 🔧 Configuration Files

### Stored In: Electron userData directory
```
~/Library/Application Support/Code/User/workspaceStorage/.../
├── bot-tester-config.json    # Endpoint & model settings
└── bot-tester-history.json   # Test history array
```

## 📝 Example Queries

The app works great with questions like:
- "What is photosynthesis?"
- "How do you make pasta?"
- "Explain machine learning in simple terms"
- "What are the planets in our solar system?"
- "How does photosynthesis work?"

## 🔌 LLM Service Options

### Ollama (Recommended)
- Easy to install and use
- Free and open-source
- Good model selection
- `ollama pull mistral` to get Mistral model

### Other Compatible Services
Any service with `/api/generate` endpoint that returns:
```json
{
  "response": "The generated text"
}
```

## ✨ Next Steps

1. **Ensure Ollama is running:**
   ```bash
   ollama serve
   ```

2. **Pull some models (optional, may already be installed):**
   ```bash
   ollama pull mistral
   ollama pull neural-chat
   ```

3. **Start the Bot Tester:**
   ```bash
   npm start
   ```

4. **Configure in app:**
   - Click ⚙️ Settings
   - Enter endpoint: `http://localhost:11434`
   - Click "Load Models"
   - Select models for Bot 2 and Bot 3
   - Click "Save Settings"

5. **Run a test:**
   - Type a query
   - Click "Run Test" or press Cmd+Enter
   - See results with color feedback!

## 🎓 Understanding Results

### Green Box (✓ Correct)
- Bot 3 determined that Bot 2's response successfully answers the query
- High confidence indicates Bot 3 is very sure
- Shows the reasoning for the positive evaluation

### Red Box (✗ Incorrect)
- Bot 3 determined that Bot 2's response does NOT adequately answer the query
- Shows why Bot 3 deemed it insufficient
- Useful for testing model quality and consistency

## 📈 Performance

- **First test**: ~5-15 seconds (depends on model size)
- **Subsequent tests**: ~5-15 seconds (models cached in memory)
- **Faster models**: TinyLlama (~2-3 seconds)
- **Larger models**: Llama2-13B (~10-20 seconds)

## 🛠️ Troubleshooting

### "Cannot connect to endpoint"
→ Make sure `ollama serve` is running in another terminal

### "No models found"
→ Pull a model: `ollama pull mistral`

### App freezes during test
→ Large models are slow; try smaller models or wait longer

### Can't select models
→ The models failed to load; check LLM service status

## 💡 Tips

- Use the same model family for Bot 2 & 3 for consistency
- Test with diverse queries to see evaluation patterns
- Check history to review past evaluations
- Keyboard shortcut: **Cmd+Enter** on Mac, **Ctrl+Enter** on Windows/Linux

---

**Status**: ✅ Ready to use
**Last Updated**: May 9, 2026
**Version**: 1.0.0
