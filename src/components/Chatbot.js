import React, { useState, useEffect, useRef } from 'react';
import OpenAI from 'openai';
import { ArrowRight, Microphone, MicrophoneSlash } from "@phosphor-icons/react";
import {
    CardBody,
    Typography,
    Input,
    Button,
} from '@material-tailwind/react';


const Chatbot = ({ dataset, onPatternQuestion, onStateQuestion, onStateFocus, currentFocusedState, currentFocusedCounty, apiUrl, isInputFocused }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    // const [isSpeechLoading, setIsSpeechLoading] = useState(false);
    const chatContainerRef = useRef(null);
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const audioRef = useRef(new Audio());
    // const [useSpeech, setUseSpeech] = useState(false);
    const inputRef = useRef(null);
    const wrapperRef = useRef(null);

    // List of US states
    const states = [
        'Alabama', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
        'Delaware', 'Florida', 'Georgia', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
        'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
        'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
        'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
        'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
        'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
        'Wisconsin', 'Wyoming'
    ];

    // Function to get n unique random states
    const getRandomStates = (n) => {
        const shuffled = [...states].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, n);
    };

    // Function to get random example questions
    const getExampleQuestions = () => {
        const [state1, state2, state3] = getRandomStates(3);
        const extrema = Math.random() < 0.5 ? 'highest' : 'lowest';
        
        // Dataset-specific questions
        if (dataset === 'walk_to_wo') {
            return [
                `What percentage of people walk to work in ${state1}?`,
                `Which state has a higher percentage of people walking to work, ${state2} or ${state3}?`,
                `Which state has the ${extrema} percentage of people walking to work?`,
                "What's the average percentage of people who walk to work?",
                "Is there a pattern in this map?",
                "Can you describe the pattern?"
            ];
        } else if (dataset === 'transit_to') {
            return [
                `What percentage of people use public transit in ${state1}?`,
                `Which state has a higher percentage of public transit usage, ${state2} or ${state3}?`,
                `Which state has the ${extrema} percentage of public transit usage?`,
                "What's the average percentage of people who use public transit?",
                "Is there a pattern in this map?",
                "Can you describe the pattern?"
            ];
        } else {  // ppl_densit
            return [
                `What's the population density of ${state1}?`,
                // `Which state has higher population density, ${state2} or ${state3}?`,
                `Which state has the ${extrema} population density?`,
                // "What's the average population density in this map?",
                "Is there a pattern in this map?",
                // "Can you describe the pattern?",
            ];
        }
    };

    // Get fresh example questions whenever dataset changes
    const [exampleQuestions, setExampleQuestions] = useState([]);
    
    useEffect(() => {
        setExampleQuestions(getExampleQuestions());
        //setUseSpeech(false);  // Reset speech mode when dataset changes
    }, [dataset]);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    // Function to handle example question click
    const handleExampleClick = (question) => {
        //setUseSpeech(false);  // Disable speech mode
        setMessages(prev => [...prev, { text: question, sender: 'user' }]);
        handleQuestionSubmit(question, false);  // Explicitly pass false to disable speech
        audioRef.current.pause();  // Stop any ongoing speech
        audioRef.current.currentTime = 0;  // Reset audio
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = async () => {
                if (audioChunksRef.current.length > 0) {
                    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                    //setUseSpeech(true);
                    await processAudioToText(audioBlob);
                }
            };

            // Request data every 250ms
            mediaRecorderRef.current.start(250);
            setIsRecording(true);
            
            // Add visual feedback for recording
            setMessages(prev => [...prev, { 
                text: 'Listening...', 
                sender: 'bot',
                isTemp: true 
            }]);
        } catch (error) {
            console.error('Error accessing microphone:', error);
            setMessages(prev => [...prev, { 
                text: 'Error accessing microphone. Please check your permissions.',
                sender: 'bot'
            }]);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            
            // Remove the "Listening..." message
            setMessages(prev => prev.filter(msg => !msg.isTemp));
        }
    };

    const processAudioToText = async (audioBlob) => {
        try {
            const openai = new OpenAI({
                apiKey: process.env.REACT_APP_OPENAI_API_KEY,
                dangerouslyAllowBrowser: true
            });
            // Show processing message
            setMessages(prev => [...prev.filter(msg => !msg.isTemp), { 
                text: 'Processing your speech...', 
                sender: 'bot',
                isTemp: true 
            }]);

            const formData = new FormData();
            formData.append('file', new File([audioBlob], 'audio.webm', { type: 'audio/webm' }));

            const transcriptionResponse = await openai.audio.transcriptions.create({
                file: new File([audioBlob], 'audio.webm', { type: 'audio/webm' }),
                model: 'whisper-1',
            });

            // Remove processing message
            setMessages(prev => prev.filter(msg => !msg.isTemp));

            let transcribedText = transcriptionResponse.text;
            
            // Filter out various forms of the microphone access message
            const micAccessMessages = [
                "Page is accessing your microphone.",
                "This page is accessing your microphone.",
                "Change the setting in the address bar.",
                "Change this setting in the address bar.",
                "This page is accessing your microphone changes setting in the address bar.",
                "Page is accessing your microphone changes setting in the address bar.",
                "Listening.",
                "listening.",
                "You are currently on an application inside of Web Content. To exit this web area, press Control, Option, Shift, Up Arrow. "
            ];

            // Remove each variation of the message
            micAccessMessages.forEach(msg => {
                transcribedText = transcribedText.replace(msg, '');
            });

            // Clean up punctuation and extra spaces
            transcribedText = transcribedText
                .replace(/[.,!?]+$/, '') // Remove ending punctuation
                .replace(/\s+/g, ' ')
                .trim();

            if (transcribedText) {
                // Convert common speech patterns to standardized commands
                transcribedText = transcribedText
                    .replace(/^(?:can you |please |could you )?(?:show me |take me to |navigate to |zoom to |move to )/i, 'go to ')
                    .replace(/^(?:can you |please |could you )?(?:focus |zoom |center |concentrate )/i, 'focus on ');

                // Add the transcribed text to chat as a user message
                setMessages(prev => [...prev, { text: transcribedText, sender: 'user' }]);
                
                // Add delay before processing the question
                // Estimate reading time: ~200ms per word + 1 second base time
                const wordCount = transcribedText.split(' ').length;
                const readingDelay = Math.max(1000, wordCount * 200);
                
                // Wait for screen reader to finish
                await new Promise(resolve => setTimeout(resolve, readingDelay));
                
                // Send to API for processing with speech preserved
                handleQuestionSubmit(transcribedText, true);
            } else {
                setMessages(prev => [...prev, { 
                    text: 'I couldn\'t detect any speech. Please try again.',
                    sender: 'bot'
                }]);
            }
        } catch (error) {
            console.error('Error processing audio:', error);
            setMessages(prev => [...prev, { 
                text: 'Sorry, I had trouble understanding that. Please try again.',
                sender: 'bot'
            }]);
        }
    };

    // const speakResponse = async (text) => {
    //     try {
    //         setIsSpeechLoading(true);
    //         const openai = new OpenAI({
    //             apiKey: process.env.REACT_APP_OPENAI_API_KEY,
    //             dangerouslyAllowBrowser: true
    //         });
    //         const speechResponse = await openai.audio.speech.create({
    //             model: 'tts-1',
    //             voice: 'alloy',
    //             input: text,
    //         });

    //         const audioBlob = new Blob([await speechResponse.arrayBuffer()], { type: 'audio/mpeg' });
    //         const audioUrl = URL.createObjectURL(audioBlob);
            
    //         audioRef.current.src = audioUrl;
    //         await audioRef.current.play();
    //     } catch (error) {
    //         console.error('Error generating speech:', error);
    //     } finally {
    //         setIsSpeechLoading(false);  // Reset speech loading state
    //     }
    // };

    // Add state for tracking previous answer
    const [previousAnswer, setPreviousAnswer] = useState(null);

    const handleQuestionSubmit = async (input, useSpeech = false) => {
        try {
            setIsLoading(true);
            
            // Create focus object that includes both state and county
            const currentFocus = currentFocusedCounty 
                ? {
                    county: currentFocusedCounty,
                    state: currentFocusedState,
                    full: `${currentFocusedCounty} County, ${currentFocusedState}`
                  }
                : {
                    state: currentFocusedState,
                    full: currentFocusedState
                  };

            console.log('Sending input to analyze:', {
                input,
                previous_answer: previousAnswer,
                current_focus: currentFocus,
                raw_state: currentFocusedState,
                raw_county: currentFocusedCounty
            });

            const response = await fetch(`${apiUrl}/api/analyze-input`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': window.location.origin
                },
                credentials: 'include',
                mode: 'cors',
                body: JSON.stringify({
                    input,
                    previous_answer: previousAnswer,
                    current_focus: currentFocus,
                    raw_state: currentFocusedState,
                    raw_county: currentFocusedCounty,
                    current_dataset: dataset
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Response:', data);

            // Handle action responses
            if (data.is_action) {
                if (data.action_type === 'focus' && data.state) {
                    onStateFocus(data.state);
                    setMessages(prev => [...prev, { 
                        text: `Focusing on ${data.state}.`, 
                        sender: 'bot' 
                    }]);
                    return;
                }
            }

            // Handle question responses
            if (data.result) {
                setPreviousAnswer(data.result); // Store the answer for context

                // Update map for pattern questions
                if (data.question_type === 'describe_pattern') {
                    onPatternQuestion(true);
                } else if (data.question_type === 'is_pattern') {
                    onPatternQuestion(false);
                }

                // Handle state/county focusing for relevant question types
                if (data.question_type === 'retrieve') {
                    if (data.county) {
                        // Don't update focus for county-level responses
                    } else if (data.state) {
                        onStateQuestion([data.state]);
                    }
                } else if (data.states && data.question_type === 'compare') {
                    onStateQuestion(data.states);
                } else if (data.question_type === 'find_extremum') {
                    onStateQuestion([data.state]);
                }

                setMessages(prev => [...prev, { text: data.result, sender: 'bot' }]);
            }

        } catch (error) {
            console.error('Error:', error);
            setMessages(prev => [...prev, { 
                text: 'Sorry, I encountered an error. Please try again.',
                sender: 'bot'
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        // input = input.trim();
        if (!input.trim()) return;

        // log 
        const log = {
            input: input,
        }
        // console.log('Log:', log);

        const userMessage = input;
        setInput('');
        //setUseSpeech(false);  // Disable speech mode
        setMessages(prev => [...prev, { text: userMessage, sender: 'user' }]);
        handleQuestionSubmit(userMessage, false);  // Explicitly pass false to disable speech
    };

    // Modify handleKeyDown for text input to ignore spacebar
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSubmit(e);
        }
        // Prevent spacebar from triggering in the input field
        if (e.code === 'Space') {
            e.stopPropagation();
        }
    };

    // Add spacebar handler for recording as a separate effect
    useEffect(() => {
        const handleSpacebarRecord = (e) => {
            if (e.code === 'Space' && !isRecording && !e.repeat && !isInputFocused) {
                e.preventDefault();
                startRecording();
            }
        };

        const handleSpacebarStop = (e) => {
            if (e.code === 'Space' && isRecording && !isInputFocused) {
                e.preventDefault();
                stopRecording();
            }
        };

        window.addEventListener('keydown', handleSpacebarRecord);
        window.addEventListener('keyup', handleSpacebarStop);

        return () => {
            window.removeEventListener('keydown', handleSpacebarRecord);
            window.removeEventListener('keyup', handleSpacebarStop);
        };
    }, [isRecording, isInputFocused]);

    // Function to get map description based on dataset
    const getMapDescription = () => {
        switch(dataset) {
            case 'walk_to_wo':
                return "This is a choropleth map of the United States showing the percentage of people who walk to work in each state. Darker shades indicate higher percentages of walking commuters.";
            case 'transit_to':
                return "This is a choropleth map of the United States showing the percentage of people who use public transit in each state. Darker shades indicate higher percentages of public transit usage.";
            default: // ppl_densit
                // return "This is a choropleth map of the United States showing population density for each state. Darker shades indicate higher population density.";
                return "This is an interactive choropleth map of the United States showing population density, optimized for screen reader users.";
        }
    };

    // Function to get general knowledge questions based on dataset
    const getGeneralQuestions = () => {
        switch(dataset) {
            case 'walk_to_wo':
                return [
                    "What's a choropleth map?",
                    "Is there a relationship between population density and the percentage of people who walk to work?"
                ];
            case 'transit_to':
                return [
                    "What's a choropleth map?",
                    "Is there a relationship between population density and public transit usage?"
                ];
            default: // ppl_densit
                return [
                    "What's a choropleth map?",
                    "Is there a relationship between income and population density?"
                ];
        }
    };

    // Get fresh general questions whenever dataset changes
    const [generalQuestions, setGeneralQuestions] = useState([]);
    
    useEffect(() => {
        setExampleQuestions(getExampleQuestions());
        setGeneralQuestions(getGeneralQuestions());
    }, [dataset]);

    useEffect(() => {
        // Cleanup function to stop audio when component unmounts or dataset changes
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
        };
    }, [dataset]);

    useEffect(() => {
        console.log('OpenAI API Key:', process.env.REACT_APP_OPENAI_API_KEY ? 'Set' : 'Not Set');
        console.log('Mapbox Token:', process.env.REACT_APP_MAPBOX_TOKEN ? 'Set' : 'Not Set');
    }, []);

    // Add new useEffect for microphone permission
    useEffect(() => {
        const requestMicrophonePermission = async () => {
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => {
                        // Stop the stream right away - we just wanted the permission
                        stream.getTracks().forEach(track => track.stop());
                    });
            } catch (error) {
                console.log('Microphone permission was denied or error occurred:', error);
            }
        };

        requestMicrophonePermission();
    }, []); // Empty dependency array means this runs once on mount

    // Add useEffect to monitor focused state changes
    useEffect(() => {
        console.log('Focus state updated:', {
            currentFocusedState,
            currentFocusedCounty
        });
    }, [currentFocusedState, currentFocusedCounty]);

    useEffect(() => {
        // Focus the welcome section on component mount
        const welcomeSection = document.getElementById('welcome');
        if (welcomeSection) {
            welcomeSection.focus();
        }
    }, []);

    // Update input ref focus when isInputFocused changes
    useEffect(() => {
        if (isInputFocused && wrapperRef.current) {
            const input = wrapperRef.current.querySelector('input');
            if (input) {
                input.focus();
            }
        }
    }, [isInputFocused]);

    return (
        <CardBody 
            className="flex flex-col h-full p-2"
            role="region"
            aria-label="MappieTalkie chat interface"
        >
            <div 
                id="welcome"  
                aria-live="polite" 
                role="region"
                tabIndex="0"
                aria-label="Welcome to MappieTalkie"
            > 
                <Typography variant="h6" color="blue-gray" className="mb-2">
                    Welcome to MappieTalkie
                </Typography>

                {/* Map Description and Example Questions Intro */}
                <Typography variant="small" color="gray" className="mb-4 text-xs">
                    <span className="italic">{getMapDescription()}</span>
                    {' You can ask me questions about the map visualization:'}
                </Typography>

                {/* Dataset-specific Questions Section */}
                <div className="mb-2">
                    <div className="flex flex-wrap gap-2">
                        {exampleQuestions.map((question, index) => (
                            <span
                                key={index}
                                onClick={() => handleExampleClick(question)}
                                className="px-3 py-1 bg-light-green-50 hover:bg-light-green-100 rounded-full text-xs text-green-900 transition-colors text-left cursor-pointer"
                                role="text"
                                tabIndex="0"
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleExampleClick(question);
                                    }
                                }}
                            >
                                {question}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Navigation Instructions */}
                <Typography variant="small" color="gray" className="mb-2 text-xs">
                    <span className="font-bold">Keyboard Shortcuts:</span>
                    <ul className="space-y-2">
                        <li>Press Ctrl + / to focus on the input box and type your question.</li>
                        <li>Press and hold the spacebar to use voice mode.</li>
                        <li>Press Ctrl + M to toggle map interaction, then use arrow keys to navigate between states.</li>
                        <li>Press + to zoom in to county level within a state. Press - to zoom back out to state level.</li>
                    </ul>
                </Typography>
                    
                {/* Quick Commands:*/}
                <Typography variant="small" color="gray" className="mb-2 text-xs">
                    <span className="font-bold">Quick Commands:</span>
                    <ul className="mb-2 space-y-3">
                        <li>
                            {"Simply type or say "}
                            <span
                                onClick={() => handleExampleClick("Go to Washington")}
                                className="px-3 py-1 bg-purple-50 hover:bg-purple-100 rounded-full text-xs text-purple-900 transition-colors text-left cursor-pointer inline-block"
                                role="text"
                                tabIndex="0"
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleExampleClick("Go to Florida!");
                                    }
                                }}
                            >
                                Go to Washington.
                            </span>
                            {" to focus on Washington or any other state."}
                        </li>
                        <li>
                            {"When focused on a state or county, you can ask specific questions like: "}
                            <span
                                onClick={() => handleExampleClick("What's the population density here?")}
                                className="px-3 py-1 bg-purple-50 hover:bg-purple-100 rounded-full text-xs text-purple-900 transition-colors text-left cursor-pointer inline-block"
                                role="text"
                                tabIndex="0"
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleExampleClick("What's the population density here?");
                                    }
                                }}
                            >
                                What's the population density here?
                            </span>
                            {" or "}
                            <span
                                onClick={() => handleExampleClick("How does this compare to neighboring states?")}
                                className="px-3 py-1 bg-purple-50 hover:bg-purple-100 rounded-full text-xs text-purple-900 transition-colors text-left cursor-pointer inline-block"
                                role="text"
                                tabIndex="0"
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleExampleClick("How does this compare to neighboring states?");
                                    }
                                }}
                            >
                                How does this compare to neighboring states?
                            </span>
                        </li>
                        <li>
                            {"For general information, try asking: "}
                            <span
                                onClick={() => handleExampleClick("What is a choropleth map?")}
                                className="px-3 py-1 bg-purple-50 hover:bg-purple-100 rounded-full text-xs text-purple-900 transition-colors text-left cursor-pointer inline-block"
                                role="text"
                                tabIndex="0"
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleExampleClick("What is a choropleth map?");
                                    }
                                }}
                            >
                                What is a choropleth map?
                            </span>
                        </li>
                        <li>
                            {"Ask"}
                            <span
                                onClick={() => handleExampleClick("What else can you do?")}
                                className="px-3 py-1 bg-purple-50 hover:bg-purple-100 rounded-full text-xs text-purple-900 transition-colors text-left cursor-pointer inline-block"
                                role="text"
                                tabIndex="0"
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleExampleClick("What else can you do?");
                                    }
                                }}
                            >
                                What else can you do?
                            </span>
                            {" to hear a list of all the things I can do."}
                        </li>
                    </ul>
                </Typography>

                {/* General Knowledge Questions Section */}
                {/* <div className="mb-4">
                    <Typography variant="small" color="gray" className="mb-2 text-xs">
                        Or ask me about:
                    </Typography>
                    <div className="flex flex-wrap gap-2">
                        {generalQuestions.map((question, index) => (
                            <span
                                key={index}
                                onClick={() => handleExampleClick(question)}
                                className="px-3 py-1 bg-purple-50 hover:bg-purple-100 rounded-full text-xs text-purple-900 transition-colors text-left cursor-pointer"
                                role="text"
                                tabIndex="0"
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleExampleClick(question);
                                    }
                                }}
                            >
                                {question}
                            </span>
                        ))}
                    </div>
                    <Typography variant="small" color="gray" className="mt-2 text-xs">
                        Press Ctrl+M to toggle map interaction. Press Ctrl+/ to focus on text input.
                        {!isInputFocused && " Press and hold the spacebar to speak."}
                    </Typography>
                </div> */}
            </div>
            <div 
                ref={chatContainerRef}
                className="flex-grow overflow-y-auto mb-2 p-2 bg-gray-50 rounded-md"
                role="log"
                aria-label="Chat messages"
                aria-live="polite"
            >
                <div role="log">
                    {messages.map((msg, index) => (
                        <div
                            key={index}
                            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} mb-2`}
                            role={msg.sender === 'user' ? 'note' : 'article'}
                            aria-label={`${msg.sender === 'user' ? 'You' : 'MappieTalkie'} said`}
                        >
                            <div
                                className={`py-2 px-4 rounded-md max-w-[80%] font-['Roboto'] ${
                                    msg.sender === 'user'
                                        ? 'bg-teal-100 text-teal-900 text-left text-xs'
                                        : 'bg-gray-200 text-gray-900 text-left text-xs'
                                }`}
                            >
                                <Typography 
                                    variant="small" 
                                    className="font-['Roboto'] font-normal leading-[1.2]"
                                    dangerouslySetInnerHTML={{ __html: msg.text }}
                                />
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
            </div>

            {/* Input, Microphone, and Send Button */}
            <div 
                className="flex gap-2 items-center"
                role="form"
                aria-label="Message input"
            >
                <div className="flex-grow">
                    <div ref={wrapperRef}>
                        <Input
                            type="text"
                            label="Ask MappieTalkie"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onFocus={() => {
                                console.log('Input focused');
                            }}
                            onBlur={() => {
                                console.log('Input blurred');
                            }}
                            className="font-['Roboto']"
                            labelProps={{
                                className: "!text-teal-500"
                            }}
                            color="teal"
                            aria-label="Type your question here"
                            aria-description="Press Enter to submit your question"
                            containerProps={{ ref: inputRef }}
                            disabled={!isInputFocused}
                        />
                    </div>
                </div>
                <Button 
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`${
                        isRecording ? 'bg-red-500' : 'bg-teal-500'
                    } text-white p-2.5 aspect-square`}
                    size="sm"
                    aria-label={isRecording ? "Stop recording voice input" : "Start recording voice input"}
                    aria-pressed={isRecording}
                >
                    {isRecording ? 
                        <MicrophoneSlash size={20} weight="bold" /> : 
                        <Microphone size={20} weight="bold" />
                    }
                </Button>
                <Button 
                    onClick={handleSubmit}
                    className={`bg-teal-500 text-white p-2.5 aspect-square ${!isInputFocused ? 'opacity-50 cursor-not-allowed' : ''}`}
                    size="sm"
                    aria-label="Send question"
                    disabled={!input.trim() || !isInputFocused}
                >
                    <ArrowRight size={20} weight="bold" />
                </Button>
            </div>
        </CardBody>
    );
};

export default Chatbot;