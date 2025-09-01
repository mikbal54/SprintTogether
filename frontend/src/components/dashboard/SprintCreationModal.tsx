import React, { useState } from "react";
import {
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Button,
	TextField,
	Snackbar,
	Alert
} from "@mui/material";
import { Formik, Form, Field } from "formik";
import type { FormikErrors } from "formik";
import { z } from "zod";
import { useWebSocket } from "../../contexts/WebSocketContext";

// Zod schema
const SprintSchema = z.object({
	name: z.string().min(1, "Sprint name is required").max(100, "Sprint name must be less than 100 characters")
});

type SprintForm = z.infer<typeof SprintSchema>;

interface SprintCreationModalProps {
	open: boolean;
	onClose: () => void;
}

const SprintCreationModal: React.FC<SprintCreationModalProps> = ({ open, onClose }) => {
	const [apiError, setApiError] = useState<string | null>(null);
	const [formKey, setFormKey] = useState<number>(0);
	const { emit } = useWebSocket();

	const handleClose = () => {
		setApiError(null);
		setFormKey((k) => k + 1);
		onClose();
	};

	// Zod validation for Formik
	const validate = (values: SprintForm) => {
		const errors: FormikErrors<SprintForm> = {};
		const result = SprintSchema.safeParse(values);
		if (!result.success) {
			for (const issue of result.error.issues) {
				const path = issue.path[0] as keyof SprintForm;
				errors[path] = issue.message as any;
			}
		}
		return errors;
	};

	const handleSubmit = async (values: SprintForm, { resetForm }: any) => {
		try {
			// Send sprint:create event to server via WebSocket
			emit('sprint:create', { name: values.name });
			
			resetForm();
			setApiError(null);
			onClose();
		} catch (err: any) {
			console.error("Error creating sprint:", err);
			setApiError("Failed to create sprint");
		}
	};

	return (
		<>
			<Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
				<DialogTitle>Create Sprint</DialogTitle>
				<Formik<SprintForm>
					key={formKey}
					initialValues={{
						name: ""
					}}
					validate={validate}
					onSubmit={handleSubmit}
				>
					{({ errors, touched, values, setFieldValue }) => (
						<Form>
							<DialogContent>
								<Field
									as={TextField}
									name="name"
									label="Sprint Name"
									fullWidth
									margin="normal"
									value={values.name}
									onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
										setFieldValue("name", e.target.value);
									}}
									error={touched.name && Boolean(errors.name)}
									helperText={touched.name && errors.name}
									placeholder="Enter sprint name..."
								/>
							</DialogContent>
							<DialogActions>
								<Button onClick={handleClose} color="inherit">
									Cancel
								</Button>
								<Button type="submit" variant="contained" color="primary">
									Create
								</Button>
							</DialogActions>
						</Form>
					)}
				</Formik>
			</Dialog>
			
			<Snackbar
				open={Boolean(apiError)}
				autoHideDuration={6000}
				onClose={() => setApiError(null)}
			>
				<Alert onClose={() => setApiError(null)} severity="error">
					{apiError}
				</Alert>
			</Snackbar>
		</>
	);
};

export default SprintCreationModal;
