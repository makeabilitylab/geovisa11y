import axios from 'axios';

const API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://mappie-talkie-api-245835075814.us-central1.run.app/api/logs'
  : 'http://localhost:5000/api/logs';

const logToMongoDB = async (logData) => {
  try {
    const response = await axios.post(API_URL, logData, {
      withCredentials: true
    });
    
    console.log('Log successfully sent to MongoDB:', response.data);
    return true;
  } catch (error) {
    console.error('Error sending log to MongoDB:', error);
    return false;
  }
};


const logAnalysisData = async (input, previousAnswer, currentFocus, currentFocusedState, currentFocusedCounty) => {
  const logData = {
    input,
    previous_answer: previousAnswer,
    current_focus: currentFocus,
    raw_state: currentFocusedState,
    raw_county: currentFocusedCounty
  };
  
  console.log('Sending input to analyze:', logData);
  return await logToMongoDB(logData);
};

export { logToMongoDB, logAnalysisData };