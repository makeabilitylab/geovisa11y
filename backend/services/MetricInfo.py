## Metric Info Class
class MetricInfo:
    def __init__(self, dataset, name, unit, is_percentage, prefix):
        self.dataset = dataset

        # data_service name
        self.name = name
        self.unit = unit
        self.is_percentage = is_percentage
        self.prefix = prefix

    # Add a formatting function to the metric info
    def format_value(self, value):
        if self.is_percentage or self.dataset.startswith('pct_'):
            # Multiply by 100 for percentage values if they're in decimal form (0-1 range)
            if value < 1:
                value = value * 100
            return f"{value:.1f}%"
        else:
            # For non-percentage values, format based on the type of metric
            if self.unit == 'households':
                # Format household counts as integers
                return f"{int(value):,} {self.unit}"
            elif self.unit:
                # For other units like population density, use 2 decimal places
                return f"{value:.2f} {self.unit}"
            else:
                return f"{value:.2f}"

    def get_description(self):
        if self.prefix:
            return f"{self.prefix} {self.name}"
        return self.name
