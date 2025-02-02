import '../styles/recordbutton.css'



// Prop only contains a text field (As seen through object destructing)
function RecordButton({ text, handleToggleRecording }) {
  // Use prop value
  // (TODO): Insert an icon here instead for the button styling perhaps
  return (
      <button
        className='custom-button'
        onClick={handleToggleRecording}
      >
      {text}
    </button>
  );
}

export default RecordButton;