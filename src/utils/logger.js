import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// Get or create session ID from localStorage
const getSessionId = () => {
  let sessionId = localStorage.getItem('mappie_session_id');
  if (!sessionId) {
    sessionId = uuidv4();
    localStorage.setItem('mappie_session_id', sessionId);
    // Also store session start time
    localStorage.setItem('mappie_session_start', new Date().toISOString());
  }
  return sessionId;
};

// Generate a unique question ID
const generateQuestionId = () => {
  return uuidv4();
};

const API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://mappie-talkie-api-245835075814.us-central1.run.app/api/logs'
  : 'http://localhost:5000/api/logs';

const logToMongoDB = async (logData) => {
  try {
    // Add session information
    logData.session_id = getSessionId();
    logData.session_start = localStorage.getItem('mappie_session_start');
    logData.timestamp = new Date().toISOString();
    logData.screen_resolution = `${window.screen.width}x${window.screen.height}`;
    logData.user_agent = navigator.userAgent;
    
    const response = await axios.post(API_URL, logData, {
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    // console.log('Log successfully sent to MongoDB:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending log to MongoDB:', error);
    return false;
  }
};

// Log when a question is asked
const logQuestionData = async (input, previousAnswer, currentFocus, currentFocusedState, currentFocusedCounty, conversationHistory, dataset, mapViewport) => {
  const questionId = generateQuestionId();
  
  const logData = {
    log_type: 'question',
    question_id: questionId,
    question_text: input,
    previous_answer: previousAnswer,
    current_focus: currentFocus,
    raw_state: currentFocusedState,
    raw_county: currentFocusedCounty,
    conversation_history: conversationHistory,
    current_dataset: dataset,
    map_viewport: mapViewport
  };
  
  // console.log('Logging question data:', logData);
  const result = await logToMongoDB(logData);
  return questionId;
};

// Log processing information
const logProcessingData = async (questionId, processingData) => {
  const logData = {
    log_type: 'processing',
    question_id: questionId,
    ...processingData
  };
  
  // console.log('Logging processing data:', logData);
  return await logToMongoDB(logData);
};

// Log the final answer
const logAnswerData = async (questionId, result, processingTime, dataset, questionType) => {
  const logData = {
    log_type: 'answer',
    question_id: questionId,
    answer_id: uuidv4(),
    result: result,
    processing_time_ms: processingTime,
    dataset: dataset,
    question_type: questionType
  };
  
  // console.log('Logging answer data:', logData);
  return await logToMongoDB(logData);
};

// Log map interactions
const logMapInteraction = async (interactionType, viewport, focusedState, focusedCounty, focusMethod) => {
  const logData = {
    log_type: 'map_interaction',
    interaction_type: interactionType, // 'zoom', 'pan', 'focus'
    viewport: viewport,
    focused_state: focusedState,
    focused_county: focusedCounty,
    focus_method: focusMethod // 'map' or 'chatbot'
  };
  
  // console.log('Logging map interaction:', logData);
  return await logToMongoDB(logData);
};

// Log session end
const logSessionEnd = async () => {
  const sessionId = getSessionId();
  const sessionStart = localStorage.getItem('mappie_session_start');
  
  const logData = {
    log_type: 'session_end',
    session_id: sessionId,
    session_start: sessionStart,
    session_duration_ms: new Date() - new Date(sessionStart)
  };
  
  // console.log('Logging session end:', logData);
  return await logToMongoDB(logData);
};

export { 
  logQuestionData, 
  logProcessingData, 
  logAnswerData, 
  logMapInteraction, 
  logSessionEnd,
  generateQuestionId
};