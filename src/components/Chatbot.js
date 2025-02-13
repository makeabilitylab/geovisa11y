// eslint-disable-next-line no-unused-vars
import React, { useState, useEffect, useRef } from 'react';
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
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState("");

    // Used to keep track of timer to send off a voice based input from client
    const voiceModeQueryTimer = useRef(null);
    const [isVoiceBasedQuery, setIsVoiceBasedQuery] = useState(false);

    // State to track if audio is playing
    // eslint-disable-next-line no-unused-vars
    const [audioPlaying, setAudioPlaying] = useState(false);
    const audioRef = useRef(null); // Ref to hold the Audio instance

    // Keeps track if the microphone has had its permission set
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

                // Adds an object to be transcribed into a HTML element for
                // the chatbox chain of messages.
                // (Added the most recent message)
                setResponses(prev => [...prev, completion.choices[0].message]);

                // Check if the response should be spoken
                if (isVoiceBasedQuery) {
                  console.log("About to play the audio");
                  // Play the the text out load if it is derived from a
                  // voice query from the client.
                  playNewAudio(completion.choices[0].message.content);

                  // Reset the state of the voice query for the next message
                  setIsVoiceBasedQuery(false);
                }
            }

            // Clears input after retriving a response from backend
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
        // Stop any audio from playing if the client decides to re type a query
        // Perhaps a TODO for later is to place a stop button on the screen
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        // Clear the timer to send a query if the user decides to self-modify
        // the query in the input form before it is sent
        stopTimer();

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
     * this handler function. This function gets executed either on click to
     * start or on click to stop
     */
    const handleToggleRecording = () => {
      if (isRecording) {
        // Stop recording (Triggers UseEffect)
        setIsRecording(false);
        console.log("Stopped recording");

        // Update the input form element to reflect the most recently recieved
        // transcript (Triggers UseEffect)
        setInput(transcript);
        console.log("After the transcript sets the input to empty");
      } else {
        // Start recording (Triggers transcript and isRecording UseEffect)
        setTranscript("");
        setIsRecording(true);
        console.log("Started recording");
      }
    };

    // Microphone related functions and useEffects

    /**
     * Checks the status of the microphone access. Updates the state variable
     * accordingly. Triggers on the load of the page
     */
    const checkMicPermission = async () => {
      try {
        // Checks if the browser supports the Permissions API:
        // https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API
        if (!(navigator.permissions)) {
          setMicPermission("Permission API not supported on your browser");
          return;
        }

        // Gets information pertaining the microphone enable status
        const permissionStatus = await navigator.permissions.query(
                                            { name: "microphone" });
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
        // If there is an error with the promise then the line of execution
        // shifts to the catch block. Otherwise continue sequentially to the
        // next line.

        console.log("Microphone access granted", stream);
        setMicPermission("granted");
      } catch (error) {
        setMicPermission("denied");
        console.error("Microphone access denied:", error);
        alert('Error: ' + error.message);
      }
    };

    // Clear the timer to send a query if the user decides to self-modify
    // the query before it is sent. No more auto send input unless voice mode
    // is reset
    const stopTimer = () => {
      if (voiceModeQueryTimer.current) {
        console.log("Terminating the timer to send the text form the input form");
        clearTimeout(voiceModeQueryTimer.current);
        voiceModeQueryTimer.current = null;

        // Stop text to speech from activating
        setIsVoiceBasedQuery(false);
      }
    }


    // Function for the text to speech feature
    // Text-to-Speech logic: Play the response as audio
    const playNewAudio = async (text) => {
      const openai = new OpenAI({
          apiKey: process.env.REACT_APP_OPENAI_API_KEY,
          dangerouslyAllowBrowser: true,
      });

      try {
          // Request speech from OpenAI
          console.log("Requesting speech from OpenAI...");

          const mp3 = await openai.audio.speech.create({
              model: "tts-1",
              voice: "sage",  // Customizable via ChatGPT website
              input: text,
          });

          // Prior buffer creation process from the mp3
          /*
            const arrayBuffer = await mp3.arrayBuffer();
          */

          console.log("Received audio response from OpenAI.");

          // Convert response into a blob URL. Essentially a blob URL set as a
          // audio/mp3 is a binary file that is temporaily saved in memory like
          // a file but isn't saved locally.
          console.log("Before buffer creation");

          // Convert response to a stream and process it in chunks
          // (This might be slightly faster than the latter)
          // Looks like CSE 333 read and write into a file stream. Read more
          // into it later
          const reader = mp3.body.getReader();
          const chunks = [];
          let totalLength = 0;

          while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
              totalLength += value.length;
          }

          // Combine chunks into a single ArrayBuffer
          const fullBuffer = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
              fullBuffer.set(chunk, offset);
              offset += chunk.length;
          }

          console.log("After buffer creation");

          // Convert to Blob and create URL
          const blob = new Blob([fullBuffer], { type: "audio/mp3" });
          const audioUrl = URL.createObjectURL(blob);

          console.log("Generated audio URL, playing now...");

          // Stop and reset previous audio if it's playing
          // Prevents overlapping audio!!!! (Later try to make an if else block
          // starting from line 352, aka the very start to make this audio
          // check occur before any processing takes place)
          if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.currentTime = 0;
          }

          // Create new audio instance and store it in ref
          audioRef.current = new Audio(audioUrl);
          audioRef.current.volume = 1.0;

          // Using the play() Promise to detect when the audio starts playing
          audioRef.current.play()
            .then(() => {
                setAudioPlaying(true); // Update state when audio starts
                console.log("Audio has started playing!");
            })
            .catch((error) => {
                console.error("Error playing audio:", error);
            });

          // Cleanup Blob URL after playback ends
          audioRef.current.onended = () => {
              URL.revokeObjectURL(audioUrl);
              console.log("Audio playback finished. Blob URL revoked.");
              audioRef.current = null; // Reset ref
              setAudioPlaying(false); // Update state when audio is stopped
          };
      } catch (error) {
        console.error('Error:', error);
        alert('Error: ' + error.message);
      }
    };

    // A dependency effect for testing purposes
    useEffect(() => {
      console.log("Current state of the isVoiceBased Query state variable: " +
                                                            isVoiceBasedQuery);
        // Only fired when the isVoiceBasedQuery state variable is set to true
        // when the timeout of the voice capture from the client into the input
        // form is complete.
        if (isVoiceBasedQuery) {
          console.log("about to send the message");
          // Send the message off to promote a handles off interaction
          handleSendMessage();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isVoiceBasedQuery]);



    // UseEffects for speech recognition feature

    // Checks the status of the mic access for the webpage on load. If not, the
    // once voice mode is clicked, a request is made to the client to give
    // access
    useEffect(() => {
      // Set the mic permissions variable
      console.log("Here on load");
      checkMicPermission();

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Used to check the current state of the mic permission state variables
    // (TODO) Perhaps remove this dependency later
    useEffect(() => {
      console.log("Current state of micPermission: " + micPermission);
    }, [micPermission]);

    /**
     * Side effect to be run when the is recording state is changed. This
     * typically occurs only when the record. Toggles the Speech Recognition
     * object to be recording or not recording depending on the "just"
     * switched to state of the isRecording state variable. Given that this
     * dependency is ran when the voice mode is used, this should also send off
     * the query immediately
     */
    useEffect(() => {
      // The recording instance only starts recording when recording state
      // has been changed to active and also if the instance has been set in
      // the first place
      if (isRecording && micPermission === "granted") {
        // Start speech recognition
        speechRecInstance.startRecording();
      } else if (!(isRecording) && micPermission === "granted") {
        // Stop the recording
        speechRecInstance.stopRecording();

        // Reset the text of the Record button.
        console.log("Stopped recording from the isRecording react hook");

        // When recording stops a timer is set till the query will be sent to
        // the back end to recieve information
        voiceModeQueryTimer.current = setTimeout(() => {
          // Send input text
          console.log("To be sent after query is in the text bar and a 2.5 second delay");

          // Set the text to speech feature on since the client is using a
          // voice query so far
          setIsVoiceBasedQuery(true);
        }, 2500);
      }

      // Cleanup function to clear timeout if component unmounts
      return () => {
        console.log("isRecording useEffect clearup");
        stopTimer();
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
      // just started. If it is non-empty then a record just took place.
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

                {/* Logic for appending messages from the client or backend
                    the msg object has a structure as follows
                    {
                    role: "assistant or user"
                    content: message
                    }*/}
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
                            onFocus={stopTimer}
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
                      text={micPermission === "granted" ?
                        (isRecording ? "Exit Voice Mode":"Use Voice Mode") : "Enable Voice Mode"
                      }
                      handleToggleRecording={micPermission === "granted" ?
                        handleToggleRecording : requestMicAccess
                      }
                      isRecording={isRecording} // Pass recording state
                    />


                </div>
            </CardBody>
        // </Card>
    );
};

export default Chatbot;
