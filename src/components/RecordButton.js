import '../styles/recordbutton.css'

// Prop only contains a text field (As seen through object destructing)
function RecordButton({ text }) {
  // Use prop value
  // (TODO): Insert an icon here instead
  return <button className='custom-button'>{text}</button>
}

export default RecordButton;