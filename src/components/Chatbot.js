// eslint-disable-next-line no-unused-vars
import React, { useState, useEffect } from 'react';
import OpenAI from 'openai';
import { ArrowRight } from "@phosphor-icons/react";
import {
    // eslint-disable-next-line no-unused-vars
    Card,
    CardBody,
    Typography,
    Input,
    Button,
} from '@material-tailwind/react';
import { DATASET_CONFIG, SPATIAL_PATTERN_KEYWORDS } from '../constants';

// Imports related to the voice to text feature
import RecordButton from './RecordButton';
import SpeechRecognition from '../services/useSpeechRecognition';

const SuggestionText = ({ text, datasetPhrase }) => {
    const parts = text.split(' in ');
    const beforeIn = parts[0];
    const afterIn = parts[1];

    // Split the text before 'in' into pre-dataset and dataset parts
    const [preDataset, ...rest] = beforeIn.split(new RegExp(`(${datasetPhrase})`, 'i'));
    // eslint-disable-next-line no-unused-vars
    const dataset = rest.join(''); // Join in case the regex split created multiple parts

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs">{preDataset}</span>
            <div className="bg-purple-50 text-purple-800 px-2 py-1 rounded-md text-xs">
                {datasetPhrase}
            </div>
            {afterIn && (
                <>
                    <span className="text-xs">in</span>
                    <div className="bg-light-green-50 text-light-green-800 px-2 py-1 rounded-md text-xs">
                        {afterIn}
                    </div>
                </>
            )}
        </div>
    );
};

const Chatbot = ({
    selectedStates,
    onStateRemove,
    onSpatialClustersChange,
    showSpatialClusters,
    currentDataset,
    onClearAllStates
}) => {
    const [input, setInput] = useState('');
    const [responses, setResponses] = useState([]);
    const [showSuggestion, setShowSuggestion] = useState(false);
    const [suggestion, setSuggestion] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // State to track if speech recognition is being used currently
    const [isSpeechRecActive, setIsSpeechRecActive] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [micPermission, setMicPermission] = useState("Checking...");

    // Initialize the SpeechRecognition instance directly (Self-Made React Hook)
    const speechRecInstance = SpeechRecognition({
      // Giving the speech recognition object access to set trancript and
      // the set recording handlers via the prop to this component
      resetTranscriptText: setTranscript,
      stopRecordingHandler: setIsRecording
    });

    const handleSendMessage = async () => {
        if (!input.trim()) return;

        try {
            setResponses(prev => [...prev, { role: 'user', content: input }]);

            setIsLoading(true);

            const isSpatialPatternQuestion = SPATIAL_PATTERN_KEYWORDS.some(
                keyword => input.toLowerCase().includes(keyword)
            );

            if (isSpatialPatternQuestion) {
                onSpatialClustersChange(true);
            }

            // First try to get analysis from backend
            const response = await fetch(`http://127.0.0.1:5000/api/analyze-density`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    question: input,
                    selected_states: selectedStates.map(state => state.name),
                    dataset: currentDataset
                })
            });

            const data = await response.json();
            console.log('Backend response:', data);

            if (data.result) {
                // When having a result from back end
                setResponses(prev => [...prev, { role: 'assistant', content: data.result }]);
            } else {
                console.log('No result from backend, falling back to OpenAI');
                // Fall back to OpenAI for non-density questions
                const openai = new OpenAI({
                    apiKey: process.env.REACT_APP_OPENAI_API_KEY,
                    dangerouslyAllowBrowser: true,
                });

                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: `You are a helpful assistant specializing in spatial data analysis.
                                     For questions about US states' population density, refer to the data.`
                        },
                        { role: 'user', content: input },
                    ],
                });

                setResponses(prev => [...prev, completion.choices[0].message]);
            }

            setInput('');
        } catch (error) {
            console.error('Error:', error);
            alert('Error: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Modify handleInputChange
    const handleInputChange = (e) => {
        const newValue = e.target.value.toLowerCase();
        setInput(e.target.value);

        // Check for dataset-specific triggers
        const currentDatasetTriggers = DATASET_CONFIG[currentDataset];
        const shouldAutoComplete = currentDatasetTriggers.phrases.some(phrase =>
            newValue.trim().endsWith(phrase.toLowerCase().trim())
        );

        if (shouldAutoComplete) {
            // Remove extra spaces before adding the completion
            const baseText = e.target.value.replace(/\s+$/, '') + ' ';
            const suggestionText = `${baseText}${currentDatasetTriggers.completion}`;

            if (selectedStates.length > 0) {
                const stateNames = selectedStates.map(state => state.name);
                if (stateNames.length === 1) {
                    setSuggestion(`${suggestionText} in ${stateNames[0]}`);
                } else {
                    const lastState = stateNames.pop();
                    setSuggestion(`${suggestionText} in ${stateNames.join(', ')} and ${lastState}`);
                }
            } else {
                setSuggestion(suggestionText);
            }
            setShowSuggestion(true);
        } else {
            // Check if the input matches any of the question templates
            const matchingTemplate = currentDatasetTriggers.questionTemplates.find(template =>
                newValue.trim().endsWith(template.toLowerCase().trim())
            );

            if (matchingTemplate && selectedStates.length > 0) {
                const stateNames = selectedStates.map(state => state.name);
                let suggestionText = newValue;

                if (stateNames.length === 1) {
                    suggestionText = `${newValue} ${stateNames[0]}`;
                } else {
                    const lastState = stateNames.pop();
                    suggestionText = newValue.endsWith(':')
                        ? `${newValue} ${stateNames.join(', ')} or ${lastState}`
                        : `${newValue} ${stateNames.join(', ')} and ${lastState}`;
                }

                setSuggestion(suggestionText);
                setShowSuggestion(true);
            } else {
                setShowSuggestion(false);
            }
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Tab' && showSuggestion) {
            e.preventDefault(); // Prevent default tab behavior
            setInput(suggestion);
            setShowSuggestion(false);
        } else if (e.key === 'Enter') {
            handleSendMessage();
        }
    };

    const handleSuggestionClick = () => {
        setInput(suggestion);
        setShowSuggestion(false);
    };

    const handleSpatialClustersRemove = () => {
        onSpatialClustersChange(false);
    };

    // Handler functions for speech recognition feature

    /**
     * Switches the recording status when called. Record button will be using
     * this handler function
     */
    const handleToggleRecording = () => {
      if (isRecording) {
        // Stop recording
        setIsRecording(false);
        console.log("Stopped recording");

        // Update the transcript bar to reflect this
        setInput(transcript);
        console.log("After the transcript sets the input to empty");
      } else {
        // Start recording (Since browser enables speech input from device)
        // and this trigger the speech recognition API via useEffect
        setTranscript("");
        setIsRecording(true);
        console.log("Started recording");
      }
    };

    /**
     * Handler function to set the isSpeechRecActive state variable to true
     * once the RecordButton component is clicked.
     */
    const handleActivateSpeechRec = () => {
      // Enable speaker access to use speech recognition API
      requestMicAccess();
    }



    // Microphone related functions and useEffects

    // Perhaps moving forward the isSpeechRecActive state variable isn't needed
    // since the micPermission state variable essitially covers all the same
    // logic. (TODO) (Look into this later)

    /**
     * Checks the status of the microphone access. Updates the state variable
     * accordingly.
     */
    const checkMicPermission = async () => {
      try {
        // Check if the browser supports the Permissions API:
        // https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API
        if (!(navigator.permissions)) {
          setMicPermission("Permission API not supported");
          return;
        }

        // Get information pertaining the microphone enable status
        const permissionStatus = await navigator.permissions.query({ name: "microphone" });
        setMicPermission(permissionStatus.state);

        // Listen for permission changes, and change the micPermission state
        // string variable if any changes occur
        permissionStatus.onchange = () => {
          setMicPermission(permissionStatus.state);
        };
      } catch (error) {
        console.error("Error checking microphone permission:", error);
        setMicPermission("Error checking permission");
      }
    };

    /**
     * Asks the client to allow access for their devices microphone. This should
     * be used when the "enable record" button text is showing and clicked.
     */
    const requestMicAccess = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("Microphone access granted", stream);
        setMicPermission("granted");
        setIsSpeechRecActive(true);
      } catch (error) {
        console.error("Microphone access denied:", error);
        setMicPermission("denied");
      }
    };



    // UseEffects for speech recognition feature

    // Checks the status of the mic access for the webpage on load. If not, the
    // record button has an "Enable Record" text.
    useEffect(() => {
      // Set the mic permissions variable
      console.log("Here on load");
      checkMicPermission();


    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      console.log("Setting the speech recognition variable");
      // Automatically display the record button if the website  has microphone
      // access already.
      if (micPermission === "granted") {
        setIsSpeechRecActive(true);
      }
    }, [micPermission]);

    // Side effect for testing whether or not speech recognizion is active
    useEffect(() => {
      if (isSpeechRecActive) {
        console.log("Speech Recognizion is created: " + isSpeechRecActive);
      }
    }, [isSpeechRecActive]);

    /**
     * Side effect to be run when the is recording state is changed. This
     * typically occurs only when the record. Toggles the Speech Recognition
     * object to be recording or not recording depending on the "just"
     * switched to state of the isRecording state variable.
     */
    useEffect(() => {
      // The recording instance only starts recording when recording state
      // has been changed to active and also if the instance has been set in
      // the first place
      if (isRecording && isSpeechRecActive) {
        // Start speech recognition
        speechRecInstance.startRecording();
      } else if (!(isRecording) && isSpeechRecActive) {
        // Stop the recording
        speechRecInstance.stopRecording();

        // Reset the text of the Record button.
        console.log("Stopped recording from the isRecording react hook");
      }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRecording]);  // Dependency array

    /**
     * Whenever the transcript value is updated and filled, it must've been
     * set by the passed down handler function into the SpeechRecongition hook.
     * Therefore this marks the end of a successful recording and the "new"
     * transcript needs to be extracted from it and placed into the input bar.
     * Otherwise we are just starting a recording and the transcript needs to be
     * reset.
     */
    useEffect(() => {
      // Load the transcript into the input bar. If it empty then its record
      // just start. If it is non-empty then a record just took place.
      setInput(transcript);

    }, [transcript]);

    return (
        // <Card className="w-full h-full p-0">
            <CardBody className="flex flex-col h-full p-2">
                <Typography variant="h6" color="blue-gray" className="mb-2">
                    MappieTalkie
                </Typography>

                {/* Selected Geographies Section */}
                <div className="mb-4 p-3 rounded-md outline outline-2 outline-blue-gray-50">
                    <div className="flex justify-between items-center mb-2">
                        <Typography variant="small" color="blue-gray" className="font-medium text-left">
                            Selected Geographies
                        </Typography>
                        {selectedStates.length > 0 && (
                            <Button
                                size="sm"
                                variant="text"
                                color="pink"
                                className="h-6 flex items-center justify-center px-2 text-xs"
                                onClick={onClearAllStates}
                            >
                                Clear All
                            </Button>
                        )}
                    </div>
                    {selectedStates.length === 0 && !showSpatialClusters ? (
                        <Typography variant="small" className="text-gray-600 italic text-left text-xs">
                            Click on areas of interest
                        </Typography>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {selectedStates.map((state) => (
                                <div
                                    key={state.id}
                                    className="bg-light-green-50 text-light-green-800 px-2 py-1 rounded-md text-xs flex items-center gap-1"
                                >
                                    <button
                                        onClick={() => onStateRemove(state.id)}
                                        className="hover:text-light-green-800 focus:outline-none"
                                        aria-label={`Remove ${state.name}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                    {state.name}
                                </div>
                            ))}
                            {showSpatialClusters && (
                                <div className="bg-blue-gray-50 text-blue-gray-800 px-2 py-1 rounded-md text-xs flex items-center gap-1">
                                    <button
                                        onClick={handleSpatialClustersRemove}
                                        className="hover:text-blue-gray-800 focus:outline-none"
                                        aria-label="Remove hot and cold spots"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                    Hot and Cold Spots
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex-grow overflow-y-auto mb-2 p-2 bg-gray-50 rounded-md">
                    {responses.map((msg, index) => (
                        <div
                            key={index}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-2`}
                        >
                            <div
                                className={`py-2 px-4 rounded-md max-w-[80%] font-['Roboto'] ${
                                    msg.role === 'user'
                                        ? 'bg-teal-100 text-teal-900 text-left text-xs'
                                        : 'bg-gray-200 text-gray-900 text-left text-xs'
                                }`}
                            >
                                <Typography
                                    variant="small"
                                    className="font-['Roboto'] font-normal leading-[1.2]"
                                >
                                    {msg.content}
                                </Typography>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start mb-2">
                            <div className="py-2 px-4 rounded-md bg-gray-200 text-gray-900 text-left text-xs">
                                <Typography
                                    variant="small"
                                    className="font-['Roboto'] font-normal leading-[1.2] italic"
                                >
                                    Looking for answers...
                                </Typography>
                            </div>
                        </div>
                    )}
                </div>

                {/* Updated Suggestion UI */}
                {showSuggestion && (
                    <div
                        className="mb-2 bg-white rounded-md shadow-lg p-3 cursor-pointer hover:bg-gray-50 border border-gray-200"
                        onClick={handleSuggestionClick}
                    >
                        <div className="flex items-center justify-between gap-4">
                            <SuggestionText
                                text={suggestion}
                                datasetPhrase={DATASET_CONFIG[currentDataset].completion}
                            />
                            <span className="text-xs text-gray-500 italic whitespace-nowrap">
                                Press Tab or click to complete
                            </span>
                        </div>
                    </div>
                )}

                {/* Input and Button */}
                <div className="flex gap-2 items-center">
                    <div className="flex-grow">
                        <Input
                            type="text"
                            label="Ask MappieTalkie"
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            className="font-['Roboto']"
                            labelProps={{
                                className: "!text-teal-500"
                            }}
                            color="teal"
                        />
                    </div>
                    <Button
                        onClick={handleSendMessage}
                        className='bg-teal-500 text-white p-2.5 aspect-square'
                        size="sm"
                    >
                        <ArrowRight size={20} weight="bold" />
                    </Button>
                    {/* New button to request audio for query */}
                    {/** Using TailWind CSS
                    <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                        Click Me
                    </button>
                    */}

                    {/* Custom button to request audio for query */}
                    <RecordButton
                      text={micPermission === "granted" && isSpeechRecActive ?
                        (isRecording ? "Stop":"Record") : "Enable Record"
                      }
                      handleToggleRecording={isSpeechRecActive ?
                        // Perhaps just passing the setter function should work
                        // {TODO}
                        handleToggleRecording : handleActivateSpeechRec
                      }
                    />


                </div>
            </CardBody>
        // </Card>
    );
};

export default Chatbot;
