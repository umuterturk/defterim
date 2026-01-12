import 'package:flutter/material.dart';

/// Simple toolbar with bold toggle and text alignment options
class SimpleToolbar extends StatelessWidget {
  final bool isBold;
  final TextAlign textAlign;
  final VoidCallback onBoldToggle;
  final Function(TextAlign) onAlignmentChange;

  const SimpleToolbar({
    super.key,
    required this.isBold,
    required this.textAlign,
    required this.onBoldToggle,
    required this.onAlignmentChange,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(
          bottom: BorderSide(
            color: Colors.grey[300]!,
            width: 1,
          ),
        ),
      ),
      child: Row(
        children: [
          // Bold toggle
          _ToolbarButton(
            icon: Icons.format_bold,
            label: 'Kalın',  // "Bold"
            isActive: isBold,
            onPressed: onBoldToggle,
          ),
          
          const SizedBox(width: 8),
          
          // Vertical divider
          Container(
            width: 1,
            height: 40,
            color: Colors.grey[300],
          ),
          
          const SizedBox(width: 8),
          
          // Alignment buttons
          _ToolbarButton(
            icon: Icons.format_align_left,
            label: 'Sola',  // "Left"
            isActive: textAlign == TextAlign.left,
            onPressed: () => onAlignmentChange(TextAlign.left),
          ),
          
          const SizedBox(width: 4),
          
          _ToolbarButton(
            icon: Icons.format_align_center,
            label: 'Ortaya',  // "Center"
            isActive: textAlign == TextAlign.center,
            onPressed: () => onAlignmentChange(TextAlign.center),
          ),
          
          const SizedBox(width: 4),
          
          _ToolbarButton(
            icon: Icons.format_align_right,
            label: 'Sağa',  // "Right"
            isActive: textAlign == TextAlign.right,
            onPressed: () => onAlignmentChange(TextAlign.right),
          ),
        ],
      ),
    );
  }
}

class _ToolbarButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onPressed;

  const _ToolbarButton({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: isActive ? const Color(0xFF4A7C59).withOpacity(0.1) : Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 28,
                color: isActive ? const Color(0xFF4A7C59) : Colors.grey[700],
              ),
              const SizedBox(height: 2),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  color: isActive ? const Color(0xFF4A7C59) : Colors.grey[700],
                  fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}



