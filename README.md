# 🪄 TubeGenie AI — YouTube Studio Autopilot

**TubeGenie AI** is a professional Chrome extension designed to eliminate the manual grind of YouTube SEO. By injecting a sleek, AI-powered floating interface directly into **YouTube Studio**, it allows creators to generate high-CTR titles, optimized descriptions, and viral tags using the **Blog Cutter AI API**.

---

## ✨ Features

* **🔘 Native Floating Action Button:** A modern, non-intrusive UI element that appears only on the "Video Details" page of YouTube Studio.
* **🤖 Blog Cutter AI Integration:** Leverage advanced AI models to analyze your video context and generate professional-grade metadata.
* **⚡ 1-Click "Generate from Title":** Instantly produce multiple variations of optimized titles and descriptions.
* **📥 Direct "Apply" Logic:** Found the perfect result? Click **Apply** to instantly populate the Title and Description fields in YouTube Studio—no manual typing required.
* **📜 History & Storage:** Automatically saves your generation history with timestamps so you can revisit and reuse your best ideas.
* **📋 Smart Copy:** One-click copy for easy manual editing or cross-platform use.

---

## 🛠️ Installation (Developer Mode)

1.  **Clone or Download** this repository to your local machine.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Toggle **"Developer mode"** in the top-right corner.
4.  Click **"Load unpacked"** and select the root folder of this project.
5.  Pin **TubeGenie AI** to your extension bar and head to your [YouTube Studio](https://studio.youtube.com).

---

## 🚀 How to Use

1.  **Enter Video Details:** Open any video in YouTube Studio for editing.
2.  **Activate the Genie:** Click the floating **TubeGenie** icon in the bottom-right corner.
3.  **Generate:** Enter your base title and click **"Generate from Title"**. The extension calls the Blog Cutter AI API to fetch results.
4.  **Apply:** Browse your generation history. Click **Apply** on the version you like most to instantly update your video fields.
5.  **Save:** Hit the native YouTube "Save" button, and you're done!

---

## 📂 Project Structure

```text
├── manifest.json    # Extension permissions and host configurations
├── content.js       # Core engine for UI injection and DOM manipulation
├── popup.html       # Extension dashboard for API Key settings
├── styles.css       # Premium Dark Mode & Glassmorphism styling
└── icons/           # High-resolution brand and interface assets
