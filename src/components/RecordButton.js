import React, { useState } from 'react';
import { Microphone, MicrophoneSlash } from "@phosphor-icons/react";
import { Button } from '@material-tailwind/react';

/**
 * RecordButton component that allows users to toggle voice recording.
 *
 * Features:
 * - Default background color: bg-teal-500
 * - Active recording state: Background changes to bg-red-500
 * - Hover effect: Shows tooltip and adds shadow effect
 * - Displays a tooltip with the button's function on hover
 * - Maintains accessibility features
 */

const RecordButton = ({ isRecording, onStartRecording, onStopRecording }) => {
    const [isHovered, setIsHovered] = useState(false);

    const handleClick = () => {
        if (isRecording) {
            onStopRecording();
        } else {
            onStartRecording();
        }
    };

    return (
        <div className="relative inline-block">
            {/* Tooltip displayed when hovered */}
            {isHovered && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded-md shadow-lg">
                    {isRecording ? "Stop Recording" : "Voice Mode"}
                </div>
            )}

            <Button 
                onClick={handleClick}
                className={`${
                    isRecording ? 'bg-red-500' : 'bg-teal-500'
                } text-white p-2.5 aspect-square`}
                size="sm"
                aria-label={isRecording ? "Stop recording voice input" : "Start recording voice input"}
                aria-pressed={isRecording}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {isRecording ? 
                    <MicrophoneSlash size={20} weight="bold" /> : 
                    <Microphone size={20} weight="bold" />
                }
            </Button>
        </div>
    );
};

export default RecordButton;
