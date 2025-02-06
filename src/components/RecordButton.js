import '../styles/recordbutton.css';
import { useState } from 'react';

/**
 * RecordButton component that allows users to toggle voice recording.
 *
 * Features:
 * - Default background color: bg-teal-500 (#14b8a6).
 * - Hover effect: Lightens background color to bg-teal-400.
 * - Active recording state: Background changes to #d43737c9.
 * - Displays a tooltip with the button's function on hover.
 */
function RecordButton({ text, handleToggleRecording, isRecording }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="relative inline-block">
      {/* Tooltip displayed when hovered */}
      {isHovered && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded-md shadow-lg">
          {text}
        </div>
      )}

      {/* Microphone button with updated styles */}
      <button
        className={`align-middle select-none font-sans font-bold text-center uppercase transition-all
          disabled:opacity-100 disabled:shadow-none disabled:pointer-events-none text-xs rounded-lg
          shadow-md shadow-gray-900/10
          hover:bg-teal-500 hover:shadow-lg hover:shadow-gray-900/20
          focus:opacity-[0.85] focus:shadow-none active:opacity-[0.85] active:shadow-none
          text-white p-2.5 aspect-square flex items-center justify-center cursor-pointer
        `}
        style={{
          backgroundColor: isRecording ? "#bc2626c9" : "#199284", // Active recording color vs default teal
          boxShadow: isHovered ? '0px 4px 10px rgba(255, 255, 255, 0.3), 0px 8px 15px rgba(0, 0, 0, 0.3)' : 'none', // White highlight + black shadow on hover
        }}
        onClick={handleToggleRecording}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Microphone Icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="white"
          className="w-5 h-5"
        >
          <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3ZM6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709V21h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291A6.751 6.751 0 0 1 6 12.75v-1.5a.75.75 0 0 1 .75-.75Z"/>
        </svg>
      </button>
    </div>
  );
}

export default RecordButton;
