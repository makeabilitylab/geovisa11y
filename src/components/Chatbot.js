import React, { useState, useEffect, useRef } from 'react';
import OpenAI from 'openai';
import { ArrowRight, Microphone, MicrophoneSlash } from "@phosphor-icons/react";
import {
    CardBody,
    Typography,
    Input,
    Button,
} from '@material-tailwind/react';
import { 
    logQuestionData, 
    logProcessingData, 
    logAnswerData, 
    generateQuestionId 
} from '../utils/logger';


const Chatbot = ({ dataset, onPatternQuestion, onStateQuestion, onStateFocus, currentFocusedState, currentFocusedCounty, apiUrl, isInputFocused, onInputClick, onCityFocus, isTaskPage = false, isTask2Page = false, showingCounties = false, countyViewState = null }) => {
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
    const [currentFocusedCity, setCurrentFocusedCity] = useState(null);
    const [stateAnnouncement, setStateAnnouncement] = useState('');

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

    // Function to get map description based on dataset
    const getMapDescription = () => {
        if (isTaskPage) {
            switch(dataset) {
                case 'pct_tot_co':
                    return "This is a choropleth map of the United States showing the percentage of priority population for the Digital Equity Act in each state. Darker shades indicate higher percentages.";
                case 'pct_no_bb_':
                    return "This is a choropleth map of the United States showing the percentage of population lacking access to broadband in each state. Darker shades indicate higher percentages.";
                default:
                    return "This is an interactive dot density map of the United States showing the heating fuel used in each state. One dot represents 100,000 households.";
            }
        } else {
            switch(dataset) {
                case 'walk_to_wo':
                    return "This is a choropleth map of the United States showing the percentage of people who walk to work in each state. Darker shades indicate higher percentages of walking commuters.";
                case 'transit_to':
                    return "This is a choropleth map of the United States showing the percentage of people who use public transit in each state. Darker shades indicate higher percentages of public transit usage.";
                default: // ppl_densit
                    return "This is an interactive choropleth map of the United States showing population density, optimized for screen reader users.";
            }
        }
    };

    // Function to get example questions based on dataset
    const getExampleQuestions = () => {
        const [state1, state2, state3] = getRandomStates(3);
        const extrema = Math.random() < 0.5 ? 'highest' : 'lowest';
        
        if (isTask2Page) {
            // Task2-specific questions
            return [
                `How many households use gas heating in ${state1}?`,
                // `Which state has more households using gas heating, ${state2} or ${state3}?`,
                `Which state has the ${extrema} number of households using gas heating?`,
                // "What's the average number of households using gas heating?",
                "Is there a pattern in this map?",
                // "Can you describe the pattern?"
            ];
        } else if (isTaskPage) {
            // Task1-specific questions
            if (dataset === 'pct_tot_co') {
                return [
                    `What's the percentage of priority population in ${state1}?`,
                    // `Which state has a higher percentage of priority population, ${state2} or ${state3}?`,
                    `Which state has the ${extrema} percentage of priority population?`,
                    // "What's the average percentage of priority population?",
                    "Is there a pattern in this map?",
                    // "Can you describe the pattern?"
                ];
            } else { // pct_no_bb_
                return [
                    `What percentage of people lack broadband or computer access in ${state1}?`,
                    // `Which state has a higher percentage lacking broadband or computer access, ${state2} or ${state3}?`,
                    `Which state has the ${extrema} percentage of peoplelacking broadband or computer access?`,
                    // "What's the average percentage of people lacking broadband or computer access?",
                    "Is there a pattern in this map?",
                    // "Can you describe the pattern?"
                ];
            }
        } else {
            // Original dataset questions
            if (dataset === 'walk_to_wo') {
                return [
                    `What percentage of people walk to work in ${state1}?`,
                    `Which state has a higher percentage of people walking to work, ${state2} or ${state3}?`,
                    `Which state has the ${extrema} percentage of people walking to work?`,
                    "What's the average percentage of people who walk to work?",
                    "Is there a pattern in this map?",
                    // "Can you describe the pattern?"
                ];
            } else if (dataset === 'transit_to') {
                return [
                    `What percentage of people use public transit in ${state1}?`,
                    `Which state has a higher percentage of public transit usage, ${state2} or ${state3}?`,
                    `Which state has the ${extrema} percentage of public transit usage?`,
                    "What's the average percentage of people who use public transit?",
                    "Is there a pattern in this map?",
                    // "Can you describe the pattern?"
                ];
            } else {  // ppl_densit
                return [
                    `What's the population density of ${state1}?`,
                    `Which state has the ${extrema} population density?`,
                    "Is there a pattern in this map?",
                ];
            }
        }
    };

    // Get fresh example questions whenever dataset changes
    const [exampleQuestions, setExampleQuestions] = useState([]);
    
    useEffect(() => {
        setExampleQuestions(getExampleQuestions());
        //setUseSpeech(false);  // Reset speech mode when dataset changes
    }, [dataset]);

    // Scroll to bottom of chat container when messages are updated
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
    const [conversationHistory, setConversationHistory] = useState([]);

    const handleQuestionSubmit = async (input, useSpeech = false) => {
        try {
            const startTime = Date.now();
            setIsLoading(true);
            
            // Add more flexible matching for "What else can you do?"
            const whatElseRegex = /^what\s+(else|more)\s+(can|could)\s+(you|i)\s+(do|ask|say).*$/i;
            if (whatElseRegex.test(input.trim()) || 
                input.toLowerCase().includes("what can you do") || 
                input.toLowerCase().includes("what else can you do")) {
                setMessages(prev => [...prev, { 
                    text: `For the current dataset, I can:<br>
                            • Compare and sort data<br>
                            • Filter information<br>
                            • Find similar values and outliers<br>
                            • Describe patterns on the map<br>
                            • Describe state shapes<br>
                            • Identify neighboring states`, 
                    sender: 'bot' 
                }]);
                setIsLoading(false);
                return;
            }

            // Create focus object that includes state, county, and showingCounties flag
            const currentFocus = currentFocusedCity 
                ? {
                    city: currentFocusedCity.name,
                    state: currentFocusedCity.state,
                    coordinates: currentFocusedCity.coordinates,
                    full: `${currentFocusedCity.name}, ${currentFocusedCity.state}`,
                    showingCounties: showingCounties
                  }
                : currentFocusedCounty 
                ? {
                    county: currentFocusedCounty,
                    state: currentFocusedState,
                    full: `${currentFocusedCounty} County, ${currentFocusedState}`,
                    showingCounties: showingCounties
                  }
                : {
                    state: currentFocusedState || countyViewState, // Use countyViewState as fallback
                    full: currentFocusedState || countyViewState,
                    showingCounties: showingCounties
                  };

            // Log the current focus for debugging
            console.log("Sending current focus to backend:", currentFocus);

            // Build conversation history from messages
            const messageHistory = messages.map(msg => msg.text);
            
            // Get map viewport information (you'll need to pass this from the Map component)
            const mapViewport = {
                zoom: window.mapZoomLevel || null,
                center: window.mapCenter || null,
                bounds: window.mapBounds || null
            };

            // Log the question data and get a question ID
            const questionId = await logQuestionData(
                input, 
                previousAnswer, 
                currentFocus, 
                currentFocusedState, 
                currentFocusedCounty, 
                messageHistory,
                dataset,
                mapViewport
            );

            // console.log('Sending input to analyze:', {
            //     input,
            //     previous_answer: previousAnswer,
            //     current_focus: currentFocus,
            //     raw_state: currentFocusedState,
            //     raw_county: currentFocusedCounty,
            //     conversation_history: messageHistory,
            //     question_id: questionId
            // });
            
            // console.log('Conversation history:', messageHistory);

            // Prepare the request data
            const requestData = {
                input: input,
                current_dataset: dataset,
                current_focus: currentFocus, 
                previous_answer: previousAnswer,
                conversation_history: messageHistory,
                question_id: questionId,
                raw_county: currentFocusedCounty,
                raw_state: currentFocusedState
            };

            const response = await fetch(`${apiUrl}/api/analyze-input`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': window.location.origin
                },
                credentials: 'include',
                mode: 'cors',
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const processingTime = Date.now() - startTime;
            
            console.log('Response:', {
                "dataset": dataset,
                "question_type": data.question_type,
                "result": data.result,
                "processing_time_ms": processingTime
            });
            
            // Log the answer data
            await logAnswerData(
                questionId, 
                data.result, 
                processingTime, 
                dataset, 
                data.question_type
            );

            // Handle action responses
            if (data.is_action) {
                if (data.action_type === 'focus_city') {
                    // Handle city focus
                    setMessages(prev => [...prev, { 
                        text: `Focusing on ${data.city_name}, ${data.state}.`, 
                        sender: 'bot' 
                    }]);
                    onCityFocus({
                        name: data.city_name,
                        state: data.state,
                        coordinates: data.coordinates
                    });
                    return;
                } else if (data.action_type === 'focus' && data.state) {
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
                setConversationHistory(prev => [...prev, input, data.result]); // Update conversation history


                if (data.question_type === 'get_pattern') {
                    onPatternQuestion(true);
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
        if (!input.trim()) return;

        const userMessage = input;
        setInput('');
        // Reset to input field after sending a message
        setUseTextarea(false);
        //setUseSpeech(false);  // Disable speech mode
        setMessages(prev => [...prev, { text: userMessage, sender: 'user' }]);
        handleQuestionSubmit(userMessage, false); 
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

            //TODO: Add general questions for other datasets
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

    // Add new state to track if we should use textarea instead of input
    const [useTextarea, setUseTextarea] = useState(false);
    
    // Modify the useEffect for monitoring input length
    useEffect(() => {
        // Switch to textarea if input is longer than 50 characters
        setUseTextarea(input.length > 50);
        // This will automatically switch back when input becomes empty after submission
    }, [input]);

    // Add a new useEffect to maintain focus when switching between input types
    useEffect(() => {
        // After the component re-renders due to switching input types,
        // restore focus to the new input element
        if (isInputFocused) {
            setTimeout(() => {
                if (useTextarea) {
                    const textarea = wrapperRef.current?.querySelector('textarea');
                    if (textarea) {
                        textarea.focus();
                        // Place cursor at the end of the text
                        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
                    }
                } else {
                    const input = wrapperRef.current?.querySelector('input');
                    if (input) {
                        input.focus();
                    }
                }
            }, 0);
        }
    }, [useTextarea, isInputFocused]);

    // Add ref for the welcome section
    const welcomeRef = useRef(null);
    
    // Add effect for Ctrl+H hotkey
    useEffect(() => {
        const handleHelpHotkey = (e) => {
            // Handle Ctrl+H to focus on welcome section
            if (e.ctrlKey && e.key.toLowerCase() === 'h') {
                e.preventDefault();
                
                // Create a clone of the welcome content
                if (welcomeRef.current) {
                    // First, focus on the welcome section
                    welcomeRef.current.focus();
                    
                    // Clone the welcome content for announcement
                    const welcomeContent = welcomeRef.current.cloneNode(true);
                    
                    // Extract text content from the welcome section
                    const textContent = welcomeRef.current.textContent;
                    
                    // Set the announcement with the full text content
                    setStateAnnouncement("Help information: " + textContent);
                    
                    // Optional: Scroll to top of chat container
                    if (chatContainerRef.current) {
                        chatContainerRef.current.scrollTop = 0;
                    }
                    
                    // Force the screen reader to re-read by temporarily removing and re-adding the content
                    const parent = welcomeRef.current.parentNode;
                    const nextSibling = welcomeRef.current.nextSibling;
                    
                    // Remove from DOM briefly
                    parent.removeChild(welcomeRef.current);
                    
                    // Re-add to DOM after a short delay
                    setTimeout(() => {
                        if (nextSibling) {
                            parent.insertBefore(welcomeRef.current, nextSibling);
                        } else {
                            parent.appendChild(welcomeRef.current);
                        }
                        welcomeRef.current.focus();
                    }, 50);
                }
            }
        };
        
        window.addEventListener('keydown', handleHelpHotkey);
        return () => window.removeEventListener('keydown', handleHelpHotkey);
    }, []);

    return (
        <CardBody 
            className="flex flex-col h-full p-2 overflow-y-auto max-h-screen min-w-[300px]"
            role="region"
            aria-label="MappieTalkie chat interface"
            style={{ maxHeight: '100vh' }}
        >
            <div 
                id="welcome"  
                ref={welcomeRef}
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
                        <li>Press Ctrl + M to toggle between map and chat interaction.</li>
                        <li>When interacting with the map, use arrow keys to navigate between states.</li>
                        <li>Press + to zoom in to county level within a state. Press - to zoom back out to state level.</li>
                        <li>When using the chat mode, tab to start voice input.</li>
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
                                Go to Washington</span>
                            {" to focus on Washington or any other state."}
                        </li>
                        <li>
                            {"When focused on a state or county, you can ask specific questions like: "}
                            <span
                                onClick={() => handleExampleClick(`What's the ${dataset === 'pct_tot_co' ? 'percentage of priority population' : dataset === 'pct_no_bb_' ? 'percentage lacking broadband access' : dataset === 'walk_to_wo' ? 'percentage of people who walk to work' : dataset === 'transit_to' ? 'percentage of public transit usage' : 'population density'} here?`)}
                                className="px-3 py-1 bg-purple-50 hover:bg-purple-100 rounded-full text-xs text-purple-900 transition-colors text-left cursor-pointer inline-block"
                                role="text"
                                tabIndex="0"
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleExampleClick(`What's the ${dataset === 'pct_tot_co' ? 'percentage of priority population' : dataset === 'pct_no_bb_' ? 'percentage lacking broadband access' : dataset === 'walk_to_wo' ? 'percentage of people who walk to work' : dataset === 'transit_to' ? 'percentage of public transit usage' : 'population density'} here?`);
                                    }
                                }}
                            >
                                What's the {dataset === 'pct_tot_co' ? 'percentage of priority population' : dataset === 'pct_no_bb_' ? 'percentage lacking broadband access' : dataset === 'walk_to_wo' ? 'percentage of people who walk to work' : dataset === 'transit_to' ? 'percentage of public transit usage' : 'population density'} here?
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
                            {"Ask "}
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
                        <li>
                            {"Press Ctrl+H anytime to hear this information again."}
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
                style={{ minHeight: '400px' }}
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
                                    dangerouslySetInnerHTML={{ __html: msg.text || ' ' }}
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

            {/* Live region for announcements */}
            <div
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                className="sr-only"
            >
                {stateAnnouncement || ' '}
            </div>

            {/* Input, Microphone, and Send Button */}
            <div 
                className="flex gap-2 items-center"
                role="form"
                aria-label="Message input"
            >
                <div className="flex-grow">
                    <div ref={wrapperRef}>
                        {useTextarea ? (
                            <div className="relative w-full min-w-[200px]">
                                <textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSubmit(e);
                                        }
                                        // Prevent spacebar from triggering in the input field
                                        if (e.code === 'Space') {
                                            e.stopPropagation();
                                        }
                                    }}
                                    onClick={() => {
                                        // Only change focus if it's not already on chat
                                        if (!isInputFocused) {
                                            onInputClick();
                                        }
                                    }}
                                    onFocus={() => {
                                        console.log('Textarea focused');
                                    }}
                                    onBlur={() => {
                                        console.log('Textarea blurred');
                                    }}
                                    className={`peer h-full min-h-[100px] w-full resize-none rounded-[7px] border border-blue-gray-200 border-t-transparent bg-transparent px-3 py-2.5 font-sans text-sm font-normal text-blue-gray-700 outline outline-0 transition-all placeholder-shown:border placeholder-shown:border-blue-gray-200 placeholder-shown:border-t-blue-gray-200 focus:border-2 focus:border-teal-500 focus:border-t-transparent focus:outline-0 disabled:resize-none disabled:border-0 disabled:bg-blue-gray-50 ${!isInputFocused ? 'opacity-50' : ''}`}
                                    placeholder=" "
                                    aria-label="Type your question here"
                                    aria-description="Press Enter to submit your question, Shift+Enter for a new line"
                                />
                                <label className={`before:content[' '] after:content[' '] pointer-events-none absolute left-0 -top-1.5 flex h-full w-full select-none text-[11px] font-normal leading-tight text-teal-500 transition-all before:pointer-events-none before:mt-[6.5px] before:mr-1 before:box-border before:block before:h-1.5 before:w-2.5 before:rounded-tl-md before:border-t before:border-l before:border-blue-gray-200 before:transition-all after:pointer-events-none after:mt-[6.5px] after:ml-1 after:box-border after:block after:h-1.5 after:w-2.5 after:flex-grow after:rounded-tr-md after:border-t after:border-r after:border-blue-gray-200 after:transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:leading-[3.75] peer-placeholder-shown:text-blue-gray-500 peer-placeholder-shown:before:border-transparent peer-placeholder-shown:after:border-transparent peer-focus:text-[11px] peer-focus:leading-tight peer-focus:text-teal-500 peer-focus:before:border-t-2 peer-focus:before:border-l-2 peer-focus:before:border-teal-500 peer-focus:after:border-t-2 peer-focus:after:border-r-2 peer-focus:after:border-teal-500 peer-disabled:text-transparent peer-disabled:before:border-transparent peer-disabled:after:border-transparent peer-disabled:peer-placeholder-shown:text-blue-gray-500`}>
                                    Ask MappieTalkie
                                </label>
                            </div>
                        ) : (
                            <Input
                                type="text"
                                label="Ask MappieTalkie"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onClick={() => {
                                    // Only change focus if it's not already on chat
                                    if (!isInputFocused) {
                                        onInputClick();
                                    }
                                }}
                                onFocus={() => {
                                    console.log('Input focused');
                                }}
                                onBlur={() => {
                                    console.log('Input blurred');
                                }}
                                className={`font-['Roboto'] ${!isInputFocused ? 'opacity-50' : ''}`}
                                labelProps={{
                                    className: "!text-teal-500"
                                }}
                                color="teal"
                                aria-label="Type your question here"
                                aria-description="Press Enter to submit your question"
                                containerProps={{ ref: inputRef }}
                            />
                        )}
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