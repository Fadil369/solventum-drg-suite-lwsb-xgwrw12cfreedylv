# This Dockerfile provides a basic development environment for the Python backend.
# For a full solution, a docker-compose.yml file would be used to orchestrate
# this container alongside a Postgres database and a mock nphies server.
# Use an official Python runtime as a parent image
FROM python:3.11-slim
# Set the working directory in the container
WORKDIR /app
# Copy the requirements file into the container at /app
# In a real project, you would generate a requirements.txt from your dependency manager (e.g., poetry, pipenv)
# For this example, we'll create a dummy one.
COPY ./src/backend/requirements.txt /app/requirements.txt
# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
# Copy the backend source code into the container
COPY ./src/backend /app
# Make port 8000 available to the world outside this container
EXPOSE 8000
# Define environment variables (can be overridden at runtime)
ENV MODULE_NAME="cdi_api"
ENV VARIABLE_NAME="app"
# Run the FastAPI app using uvicorn when the container launches
# The --host 0.0.0.0 flag makes the server accessible from outside the container.
CMD ["uvicorn", "cdi_api:app", "--host", "0.0.0.0", "--port", "8000"]
# --- To create a dummy requirements.txt for this Dockerfile: ---
#
# cat > src/backend/requirements.txt << EOL
# fastapi
# uvicorn[standard]
# pydantic
# requests
# EOL
#
# --- To build and run this Docker image: ---
#
# 1. Build the image:
#    docker build -f docker/dev.Dockerfile -t solventum-backend .
#
# 2. Run the container:
#    docker run -p 8000:8000 --name solventum-api solventum-backend
#