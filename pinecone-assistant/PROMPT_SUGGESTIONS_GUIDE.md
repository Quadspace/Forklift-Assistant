# Prompt Suggestions System Guide

## Overview

The Forklift Assistant now includes an intelligent prompt suggestions system that helps users discover what they can ask and provides contextual follow-up questions based on the conversation flow.

## Features

### 🚀 **Starter Prompts**
When users first visit the assistant, they see categorized starter prompts to help them get started:

#### **Categories:**
- **🔧 Safety & Maintenance**: Daily checks, inspections, maintenance schedules
- **🔍 Troubleshooting**: Common problems and diagnostic procedures  
- **⚙️ Operations**: Loading, capacity calculations, best practices
- **📋 Documentation**: Manuals, records, certifications
- **📄 Your Documents**: Dynamic prompts based on uploaded PDF files

### 🧠 **Smart Follow-up Suggestions**
After each AI response, the system analyzes the content and suggests relevant follow-up questions:

#### **Intelligent Matching:**
- **Safety-related responses** → Safety compliance and procedure questions
- **Maintenance topics** → Cost, tools, and timing questions
- **Hydraulic system info** → Fluid, levels, and troubleshooting questions
- **Battery/electrical content** → Charging, lifespan, and diagnostic questions
- **Troubleshooting responses** → Root cause and urgency questions
- **Load/capacity info** → Weight limits and safety questions
- **Documentation references** → Additional resources and procedures

### 📄 **Document-Aware Prompts**
The system automatically generates prompts based on your uploaded PDF files:
- **Manuals/Guides** → "What's covered in [document]?"
- **Safety SOPs** → "Show me emergency procedures from [document]"
- **Maintenance docs** → "What maintenance schedule is outlined in [document]?"
- **Parts diagrams** → "Show me the parts diagram from [document]"

## User Experience

### **Visual Design**
- **Animated Transitions**: Smooth fade-in and slide-up animations
- **Category Icons**: Visual indicators for different prompt types
- **Hover Effects**: Interactive feedback with scaling and shadows
- **Smart Badges**: "Click to ask" and "Smart suggestions" indicators
- **Document Counter**: Shows number of available reference documents

### **Interaction Flow**
1. **Initial Visit**: Shows categorized starter prompts
2. **Category Selection**: Filter prompts by category
3. **Auto-Submit**: Clicking a prompt automatically sends it to the AI
4. **Follow-up Display**: After AI response, shows contextual suggestions
5. **Easy Navigation**: "Back to main topics" option available

### **Responsive Behavior**
- **Hidden During Streaming**: Suggestions hide while AI is responding
- **Dynamic Updates**: Follow-up suggestions update based on conversation
- **Mobile Friendly**: Grid layout adapts to screen size

## Technical Implementation

### **Component Structure**
```typescript
interface PromptSuggestionsProps {
  messages: Message[];
  files: File[];
  onPromptSelect: (prompt: string) => void;
  isStreaming: boolean;
}
```

### **Key Functions**
- `generateFileSpecificPrompts()`: Creates prompts based on uploaded files
- `generateFollowUpSuggestions()`: Analyzes AI responses for relevant follow-ups
- `getEnhancedStarterPrompts()`: Combines base prompts with file-specific ones

### **Pattern Matching**
The system uses keyword-based pattern matching to identify relevant follow-up suggestions:

```typescript
const FOLLOW_UP_PATTERNS = [
  {
    keywords: ["safety", "check", "inspection"],
    suggestions: ["What happens if I skip a safety check?", ...]
  },
  // ... more patterns
];
```

## Configuration

### **Starter Prompts**
Easily customizable in `STARTER_PROMPTS` array:
```typescript
const STARTER_PROMPTS = [
  {
    category: "Safety & Maintenance",
    prompts: [
      "What are the daily safety checks I should perform?",
      // ... more prompts
    ]
  }
];
```

### **Follow-up Patterns**
Add new patterns in `FOLLOW_UP_PATTERNS`:
```typescript
{
  keywords: ["new", "topic", "keywords"],
  suggestions: [
    "Relevant follow-up question 1",
    "Relevant follow-up question 2"
  ]
}
```

## Best Practices

### **For Users**
1. **Explore Categories**: Use category filters to find specific topics
2. **Try Follow-ups**: Use suggested follow-up questions for deeper insights
3. **Document-Specific**: Look for prompts related to your uploaded files
4. **Natural Flow**: Let the suggestions guide your conversation naturally

### **For Administrators**
1. **Regular Updates**: Keep starter prompts current with operational needs
2. **Pattern Refinement**: Monitor which follow-ups are most useful
3. **File Organization**: Use descriptive filenames for better auto-prompts
4. **User Feedback**: Collect feedback on prompt relevance and usefulness

## Customization Examples

### **Adding Industry-Specific Prompts**
```typescript
{
  category: "Warehouse Operations",
  prompts: [
    "What's the proper stacking height for pallets?",
    "How do I optimize warehouse traffic flow?",
    "What are the OSHA requirements for forklift operations?"
  ]
}
```

### **Adding New Follow-up Patterns**
```typescript
{
  keywords: ["OSHA", "regulation", "compliance"],
  suggestions: [
    "What are the penalties for non-compliance?",
    "How often do I need compliance training?",
    "Where can I find the latest OSHA updates?"
  ]
}
```

## Analytics & Insights

### **Tracking Metrics**
- Most popular starter prompts
- Follow-up suggestion click rates
- Category usage patterns
- Document-specific prompt engagement

### **Optimization Opportunities**
- A/B test different prompt phrasings
- Analyze conversation flows
- Identify gaps in prompt coverage
- Monitor user satisfaction with suggestions

## Future Enhancements

- [ ] **Machine Learning**: AI-powered suggestion generation
- [ ] **User Personalization**: Learn from individual user preferences
- [ ] **Context Awareness**: Consider conversation history depth
- [ ] **Multi-language Support**: Prompts in different languages
- [ ] **Voice Integration**: Spoken prompt suggestions
- [ ] **Prompt Analytics**: Detailed usage statistics
- [ ] **Custom Categories**: User-defined prompt categories
- [ ] **Collaborative Prompts**: Team-shared prompt libraries

## Troubleshooting

### **Common Issues**
| Issue | Cause | Solution |
|-------|-------|----------|
| No follow-ups showing | Keywords not matching | Check pattern keywords |
| Prompts not auto-submitting | JavaScript error | Check console for errors |
| File prompts not appearing | File processing issue | Verify file upload success |
| Suggestions too generic | Pattern too broad | Refine keyword matching |

### **Debug Tips**
1. Check browser console for errors
2. Verify file array is populated
3. Test pattern matching manually
4. Monitor component re-renders

---

**Last Updated**: January 2025  
**Version**: 1.0  
**Status**: Production Ready 