import React from 'react';
import {
    Dialog,
    DialogHeader,
    DialogBody,
    Typography,
    IconButton,
} from "@material-tailwind/react";
import { X } from "@phosphor-icons/react";
import { APP_CONFIG } from '../config/appConfig';

const HelpPopup = ({ open, handleOpen, dataset }) => {
    // Function to get the appropriate data label based on dataset
    const getDataLabel = () => {
        switch(dataset) {
            case 'pct_tot_co':
                return 'percentage of underserved population';
            case 'pct_no_bb_':
                return 'percentage lacking broadband access';
            default:
                return 'population density';
        }
    };

    return (
        <Dialog
            open={open}
            handler={handleOpen}
            className="bg-white overflow-hidden"
            size="md"
            aria-labelledby="help-dialog-title"
            aria-live="polite"
            tabIndex="0"
        >
            <DialogHeader id="help-dialog-title" className="border-b border-gray-200 flex justify-between items-center">
                <Typography variant="h6" color="blue-gray" as="h2">
                    {APP_CONFIG.name} Help Guide
                </Typography>
                <IconButton
                    variant="text"
                    color="blue-gray"
                    onClick={handleOpen}
                    className="p-2"
                    aria-label="Close help window"
                >
                    <X size={20} weight="bold" />
                </IconButton>
            </DialogHeader>
            <DialogBody 
            className="h-[40vh] overflow-y-auto pr-4"
            aria-live="polite"
            >
                <div className="space-y-4">
                    <section>
                        <Typography variant="h6" color="blue-gray" className="mb-2 text-sm" as="h3">
                            Keyboard Shortcuts
                        </Typography>
                        <ul className="list-disc pl-5 space-y-2 text-sm">
                            <li>Press <kbd className="ml-1 px-1 py-0.5 border border-blue-gray-500 rounded">Ctrl+M</kbd> to toggle between map and chat interaction</li>
                            <li>When interacting with the map, use <kbd className="ml-1 px-1 py-0.5 border border-blue-gray-500 rounded">←</kbd> <kbd className="ml-1 px-1 py-0.5 border border-blue-gray-500 rounded">↑</kbd> <kbd className="ml-1 px-1 py-0.5 border border-blue-gray-500 rounded">→</kbd> <kbd className="ml-1 px-1 py-0.5 border border-blue-gray-500 rounded">↓</kbd> to navigate between states</li>
                            <li>Press <kbd className="ml-1 px-1 py-0.5 border border-blue-gray-500 rounded">+</kbd> to zoom in to county level within a state</li>
                            <li>Press <kbd className="ml-1 px-1 py-0.5 border border-blue-gray-500 rounded">-</kbd> to zoom back out to state level</li>
                            <li>When using chat mode, press <kbd className="ml-1 px-1 py-0.5 border border-blue-gray-500 rounded">Tab</kbd> to start voice input</li>
                            <li>Press <kbd className="ml-1 px-1 py-0.5 border border-blue-gray-500 rounded">Ctrl+L</kbd> to hear the last response again</li>
                            <li>Press <kbd className="ml-1 px-1 py-0.5 border border-blue-gray-500 rounded">Ctrl+H</kbd> to show/hide this help window</li>
                            <li>Press <kbd className="ml-1 px-1 py-0.5 border border-blue-gray-500 rounded">Ctrl+I</kbd> to refresh question suggestions</li>
                        </ul>
                    </section>

                    <section>
                        <Typography variant="h6" color="blue-gray" className="mb-2 text-sm" as="h3">
                            Quick Navigation Commands
                        </Typography>
                        <ul className="list-disc pl-5 space-y-2 text-sm">
                            <li>Simply type or say "Go to [State Name]" to focus on any state</li>
                            <li>When focused on a state or county, you can ask place-specific questions like:
                                <ul className="list-circle pl-5 mt-1">
                                    <li>{`What's the ${getDataLabel()} here?`}</li>
                                    <li>How does this compare to neighboring states?</li>
                                    <li>What's the shape of this state?</li>
                                    <li>Which counties have the highest values?</li>
                                </ul>
                            </li>
                        </ul>
                    </section>

                    <section>
                        <Typography variant="h6" color="blue-gray" className="mb-2 text-sm" as="h3">
                            Tips
                        </Typography>
                        <ul className="list-disc pl-5 space-y-2 text-sm">
                            <li>Type "What else can you do?" to see all available features</li>
                            <li>Ask about patterns or trends to get deeper insights</li>
                            <li>This is an AI-based system, so it may make mistakes.</li>
                        </ul>
                    </section>
                </div>
            </DialogBody>
        </Dialog>
    );
};

export default HelpPopup; 